import { ExploreEvent, RunStatus } from '@baia/shared';
import { Injectable, Logger } from '@nestjs/common';

import { ConfigService } from '../config/config.service';
import { toUserMessage } from '../common/user-facing-error';
import { GherkinGeneratorService } from '../gherkin/gherkin-generator.service';
import { OutputWriterService } from '../output/output-writer.service';
import { RunCancellationService } from '../runs/run-cancellation.service';
import { RunsEventsService } from '../runs/runs.events';
import { RunsService } from '../runs/runs.service';

import { ActionExecutorService } from './action-executor.service';
import { ActionPlannerService } from './action-planner.service';
import { CrawlCaptureService } from './crawl-capture.service';
import { ExitGateService } from './exit-gate.service';
import { PlaywrightRunnerService } from './playwright-runner.service';

/**
 * Orchestrates Phase 1 (Exploratory Analyst) for a single run.
 *
 * Flow: queued → exploring → [planner+capture loop] → Gherkin generation →
 * store on run → analyzing. On any error: emit error event → failed.
 */
@Injectable()
export class ExploreOrchestrator {
  private readonly logger = new Logger(ExploreOrchestrator.name);

  constructor(
    private readonly runsService: RunsService,
    private readonly runsEvents: RunsEventsService,
    private readonly runner: PlaywrightRunnerService,
    private readonly executor: ActionExecutorService,
    private readonly planner: ActionPlannerService,
    private readonly crawler: CrawlCaptureService,
    private readonly gherkinGen: GherkinGeneratorService,
    private readonly outputWriter: OutputWriterService,
    private readonly exitGate: ExitGateService,
    private readonly configService: ConfigService,
    private readonly cancellationService: RunCancellationService
  ) {}

  /**
   * Execute Phase 1 for the given run.
   *
   * Expects `runId` to be in `queued` state. Transitions to `exploring` before
   * any async work, so callers can detect overlapping invocations via the
   * state machine guard.
   *
   * @throws {IllegalRunTransitionError} if the run is not in `queued` state.
   * @throws {NotFoundException} if `runId` is unknown.
   */
  async executePhase1(runId: string, targetUrl: string, instructions: string): Promise<void> {
    this.runsService.transitionRun(runId, RunStatus.Exploring);
    this.logger.log(`Run ${runId}: queued → exploring`);

    try {
      await this.runner.launch();

      const page = this.runner.getPage()!;
      const trace = this.crawler.createTrace(runId);

      // Navigate to the target URL before entering the perceive-plan-act loop.
      const navResult = await this.executor.execute(page, { type: 'navigate', url: targetUrl });
      this.logger.log(`Run ${runId}: navigated — ${navResult.observation}`);

      const previousActions: Array<{ action: string; ok: boolean }> = [];
      const MAX_STEPS = this.configService.exploreMaxSteps;
      const PHASE_TIMEOUT_MS = this.configService.explorePhaseTimeoutMs;
      const phaseStarted = Date.now();
      let lastHttpStatus: number | undefined = navResult.httpStatus;
      let budgetExhausted = false;

      for (let step = 0; step < MAX_STEPS; step++) {
        // Check phase timeout at the top of each iteration.
        if (Date.now() - phaseStarted > PHASE_TIMEOUT_MS) {
          this.emitExploreEvent(runId, 'observation', 'Phase 1 timed out — stopping exploration', {
            exitReason: 'timeout',
            step,
          });
          break;
        }

        // Check for user-requested cancellation.
        if (this.cancellationService.isCancelled(runId)) {
          this.emitExploreEvent(runId, 'observation', 'Run cancelled by user', {
            exitReason: 'cancelled',
            step,
          });
          break;
        }

        // 1. Perceive — screenshot + DOM capture.
        const shot = await this.runner.captureScreenshot();
        await this.outputWriter.saveScreenshot(runId, step, shot.url, shot.data);
        this.emitExploreEvent(
          runId,
          'screenshot',
          shot.url,
          { step },
          shot.data.toString('base64')
        );

        const capturedStep = await this.crawler.captureStep(
          runId,
          page,
          step,
          'perceiving page state',
          true,
          lastHttpStatus
        );
        trace.steps.push(capturedStep);

        // 2. Plan — decide the single next action using screenshot + DOM.
        const stepResult = await this.planner.planNextStep({
          instruction: instructions,
          currentUrl: page.url(),
          domSnapshot: capturedStep.domSnapshot,
          screenshotBase64: shot.data.toString('base64'),
          previousActions: previousActions.map((p) => `${p.ok ? '✓' : '✗'} ${p.action}`),
        });

        // Fast-path cancellation check after the LLM/planner await.
        if (this.cancellationService.isCancelled(runId)) {
          this.emitExploreEvent(runId, 'observation', 'Run cancelled by user', {
            exitReason: 'cancelled',
            step,
          });
          break;
        }

        this.emitExploreEvent(runId, 'observation', stepResult.pageDescription, { step });

        // 3. Check goal completion.
        if (stepResult.goalReached || !stepResult.action) {
          this.emitExploreEvent(runId, 'observation', 'Goal reached — stopping exploration', {
            exitReason: 'success-criteria-reached',
            step,
          });
          break;
        }

        // 4. Act — execute the planned action.
        const result = await this.executor.execute(page, stepResult.action);
        if (result.httpStatus !== undefined) lastHttpStatus = result.httpStatus;
        previousActions.push({ action: result.observation, ok: result.ok });

        this.emitExploreEvent(runId, 'action', result.observation, {
          step,
          actionType: stepResult.action.type,
          ok: result.ok,
        });

        // 5. Exit gate check after acting.
        const exitDecision = this.exitGate.checkStep(trace.steps);
        if (exitDecision.shouldExit) {
          this.emitExploreEvent(runId, 'observation', exitDecision.message, {
            exitReason: exitDecision.exitReason,
          });
          break;
        }

        // If this is the last iteration and we haven't broken out, mark budget exhausted.
        if (step === MAX_STEPS - 1) {
          budgetExhausted = true;
        }
      }

      if (budgetExhausted) {
        this.emitExploreEvent(
          runId,
          'observation',
          `Step budget exhausted after ${MAX_STEPS} steps — journey may be incomplete`,
          { exitReason: 'max-steps' }
        );
      }

      trace.completedAt = new Date();

      const gherkinDoc = await this.gherkinGen.generateGherkin(trace);
      this.runsService.storeGherkinDoc(runId, gherkinDoc);
      await this.outputWriter.saveGherkinDoc(runId, gherkinDoc);

      this.emitExploreEvent(runId, 'complete', 'Phase 1 exploration complete', {
        featureCount: gherkinDoc.features.length,
      });

      this.runsService.transitionRun(runId, RunStatus.Analyzing);
      this.logger.log(`Run ${runId}: exploring → analyzing`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Run ${runId}: Phase 1 failed — ${message}`,
        err instanceof Error ? err.stack : err
      );

      this.emitExploreEvent(runId, 'error', toUserMessage(err, 'Phase 1 (Explore)'), {
        error: message,
      });

      this.runsService.transitionRun(runId, RunStatus.Failed);
      throw err;
    } finally {
      await this.runner.teardown();
    }
  }

  private emitExploreEvent(
    runId: string,
    type: ExploreEvent['type'],
    message: string,
    details?: Record<string, unknown>,
    screenshotBase64?: string
  ): void {
    const event: ExploreEvent = {
      timestamp: new Date(),
      type,
      message,
      ...(details && Object.keys(details).length > 0 ? { details } : {}),
      ...(screenshotBase64 ? { screenshotBase64 } : {}),
    };
    this.runsEvents.emit(runId, event);
  }
}
