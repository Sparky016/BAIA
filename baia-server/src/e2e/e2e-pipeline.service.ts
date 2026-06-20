import { Injectable, Logger } from '@nestjs/common';

import { AnalyzeOrchestrator } from '../code-analyst/analyze.orchestrator';
import { ExploreOrchestrator } from '../explore/explore.orchestrator';
import { ReconcileOrchestrator } from '../reconcile/reconcile.orchestrator';

/**
 * E2E-only service that chains Phase 1 → Phase 2 → Reconcile in sequence.
 * Called by E2eStartController as a fire-and-forget background operation so
 * that the /start endpoint can return immediately (202 Accepted).
 */
@Injectable()
export class E2ePipelineService {
  private readonly logger = new Logger(E2ePipelineService.name);

  constructor(
    private readonly exploreOrchestrator: ExploreOrchestrator,
    private readonly analyzeOrchestrator: AnalyzeOrchestrator,
    private readonly reconcileOrchestrator: ReconcileOrchestrator
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

    await this.exploreOrchestrator.executePhase1(runId, targetUrl, instructions);
    this.logger.log(`Run ${runId}: Phase 1 complete (${Date.now() - startTime}ms elapsed)`);

    await this.analyzeOrchestrator.executePhase2(runId, repoUrl, repoProvider, credentialsRef);
    this.logger.log(`Run ${runId}: Phase 2 complete (${Date.now() - startTime}ms elapsed)`);

    await this.reconcileOrchestrator.executeReconcile(runId);
    this.logger.log(
      `Run ${runId}: pipeline complete — total time ${Date.now() - startTime}ms`
    );
  }
}
