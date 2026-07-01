import { RunStatus } from '@baia/shared';
import { Injectable, Logger } from '@nestjs/common';

import { AnalyzeOrchestrator } from '../code-analyst/analyze.orchestrator';
import { ExploreOrchestrator } from '../explore/explore.orchestrator';
import { ReconcileOrchestrator } from '../reconcile/reconcile.orchestrator';
import { RunsEventsService } from '../runs/runs.events';
import { RunsService } from '../runs/runs.service';

const TERMINAL_STATUSES = new Set<RunStatus>([RunStatus.Done, RunStatus.Failed]);

@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly exploreOrchestrator: ExploreOrchestrator,
    private readonly analyzeOrchestrator: AnalyzeOrchestrator,
    private readonly reconcileOrchestrator: ReconcileOrchestrator,
    private readonly runsService: RunsService,
    private readonly runsEvents: RunsEventsService
  ) {}

  async runFullPipeline(
    runId: string,
    targetUrl: string,
    instructions: string,
    repoUrl?: string,
    repoProvider?: 'github' | 'azure',
    credentialsRef?: string
  ): Promise<void> {
    this.logger.log(
      `Pipeline starting for run ${runId} | targetUrl=${targetUrl} | repo=${repoProvider ?? 'none'}`
    );
    const startTime = Date.now();

    try {
      await this.exploreOrchestrator.executePhase1(runId, targetUrl, instructions);
      this.logger.log(`Run ${runId}: Phase 1 complete (${Date.now() - startTime}ms elapsed)`);

      await this.analyzeOrchestrator.executePhase2(runId, repoUrl, repoProvider, credentialsRef);
      this.logger.log(`Run ${runId}: Phase 2 complete (${Date.now() - startTime}ms elapsed)`);

      await this.reconcileOrchestrator.executeReconcile(runId);
      this.logger.log(`Run ${runId}: pipeline complete — total time ${Date.now() - startTime}ms`);
    } catch (err) {
      // Orchestrators already transition to Failed + emit an error event for errors
      // inside their own try blocks. This catch is a backstop for errors thrown
      // before an orchestrator's try starts (e.g. PlaywrightRunnerService.launch()
      // failing before execute.Phase1's try block, or RunsService.getRun() throwing).
      const run = this.runsService.tryGetRun(runId);
      if (run && !TERMINAL_STATUSES.has(run.status)) {
        const message = err instanceof Error ? err.message : String(err);
        this.runsEvents.emit(runId, {
          timestamp: new Date(),
          type: 'error',
          message: `Pipeline failed: ${message}`,
          details: { error: message },
        });
        this.runsService.transitionRun(runId, RunStatus.Failed);
      }
      throw err;
    }
  }
}
