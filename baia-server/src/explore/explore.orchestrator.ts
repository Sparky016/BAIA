import { ExploreEvent, RunStatus } from '@baia/shared';
import { Injectable, Logger } from '@nestjs/common';

import { GherkinGeneratorService } from '../gherkin/gherkin-generator.service';
import { RunsEventsService } from '../runs/runs.events';
import { RunsService } from '../runs/runs.service';

import { ActionExecutorService } from './action-executor.service';
import { ActionPlannerService } from './action-planner.service';
import { CrawlCaptureService } from './crawl-capture.service';
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
    private readonly gherkinGen: GherkinGeneratorService
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
    const run = this.runsService.getRun(runId);
    const fromStatus = run.status;

    this.runsService.transitionRun(runId, RunStatus.Exploring);
    this.runsEvents.emit(runId, {
      runId,
      from: fromStatus,
      to: RunStatus.Exploring,
      at: Date.now(),
    });
    this.logger.log(`Run ${runId}: queued → exploring`);

    try {
      await this.runner.launch();

      const page = this.runner.getPage()!;
      const trace = this.crawler.createTrace(runId);

      const navResult = await this.executor.execute(page, { type: 'navigate', url: targetUrl });
      const initialStep = await this.crawler.captureStep(runId, page, 0, navResult.observation);
      trace.steps.push(initialStep);

      const planResult = await this.planner.planActions({
        instruction: instructions,
        currentUrl: page.url(),
        domSnapshot: initialStep.domSnapshot,
      });

      this.emitExploreEvent(
        runId,
        'observation',
        `Planned ${planResult.actions.length} action(s): ${planResult.goalSummary}`,
        {
          stopReason: planResult.stopReason,
          stepsUsed: planResult.stepsUsed,
        }
      );

      for (let i = 0; i < planResult.actions.length; i++) {
        const action = planResult.actions[i];
        const result = await this.executor.execute(page, action);
        this.emitExploreEvent(runId, 'action', result.observation, {
          actionIndex: i,
          actionType: action.type,
          ok: result.ok,
        });
        const step = await this.crawler.captureStep(runId, page, i + 1, result.observation);
        trace.steps.push(step);
      }

      trace.completedAt = new Date();

      const gherkinDoc = await this.gherkinGen.generateGherkin(trace);
      this.runsService.storeGherkinDoc(runId, gherkinDoc);

      this.emitExploreEvent(runId, 'complete', 'Phase 1 exploration complete', {
        featureCount: gherkinDoc.features.length,
      });

      this.runsService.transitionRun(runId, RunStatus.Analyzing);
      this.runsEvents.emit(runId, {
        runId,
        from: RunStatus.Exploring,
        to: RunStatus.Analyzing,
        at: Date.now(),
      });
      this.logger.log(`Run ${runId}: exploring → analyzing`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Run ${runId}: Phase 1 failed — ${message}`);

      this.emitExploreEvent(runId, 'error', `Phase 1 failed: ${message}`, { error: message });

      this.runsService.transitionRun(runId, RunStatus.Failed);
      // Terminal transition — stream auto-completes after this emit.
      this.runsEvents.emit(runId, {
        runId,
        from: RunStatus.Exploring,
        to: RunStatus.Failed,
        at: Date.now(),
      });
    } finally {
      await this.runner.teardown();
    }
  }

  private emitExploreEvent(
    runId: string,
    type: ExploreEvent['type'],
    message: string,
    details?: Record<string, unknown>
  ): void {
    const event: ExploreEvent = {
      timestamp: new Date(),
      type,
      message,
      ...(details ? { details } : {}),
    };
    this.runsEvents.emit(runId, event);
  }
}
