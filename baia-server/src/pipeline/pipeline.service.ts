import { Injectable, Logger } from '@nestjs/common';

import { AnalyzeOrchestrator } from '../code-analyst/analyze.orchestrator';
import { ExploreOrchestrator } from '../explore/explore.orchestrator';
import { ReconcileOrchestrator } from '../reconcile/reconcile.orchestrator';

/**
 * Chains Phase 1 (Explore) → Phase 2 (Analyse) → Phase 3 (Reconcile) in
 * sequence. Called by StartController as a fire-and-forget background
 * operation so that the /start endpoint can return 202 immediately.
 *
 * In E2E mode (E2E=true) the concrete orchestrators bound to
 * ExploreOrchestrator / repo connectors are replaced with deterministic mocks
 * by PipelineModule — this service itself is identical in both modes.
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

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
    this.logger.log(`Run ${runId}: pipeline complete — total time ${Date.now() - startTime}ms`);
  }
}
