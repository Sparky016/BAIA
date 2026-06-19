import { Injectable } from '@nestjs/common';

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
  constructor(
    private readonly exploreOrchestrator: ExploreOrchestrator,
    private readonly analyzeOrchestrator: AnalyzeOrchestrator,
    private readonly reconcileOrchestrator: ReconcileOrchestrator
  ) {}

  async runFullPipeline(
    runId: string,
    targetUrl: string,
    instructions: string,
    repoUrl: string,
    repoProvider: 'github' | 'azure',
    credentialsRef: string
  ): Promise<void> {
    await this.exploreOrchestrator.executePhase1(runId, targetUrl, instructions);
    await this.analyzeOrchestrator.executePhase2(runId, repoUrl, repoProvider, credentialsRef);
    await this.reconcileOrchestrator.executeReconcile(runId);
  }
}
