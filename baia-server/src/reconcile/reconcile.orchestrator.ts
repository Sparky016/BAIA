import { ExploreEvent, RunStatus } from '@baia/shared';
import { Injectable, Logger } from '@nestjs/common';

import { IllegalRunTransitionError } from '../runs/run-state-machine';
import { RunsEventsService } from '../runs/runs.events';
import { RunsService } from '../runs/runs.service';

import { ReconciliationService } from './reconciliation.service';
import { UnifiedDocMapper } from './unified-doc.mapper';

/**
 * Orchestrates the reconciliation phase (S5) for a single run.
 *
 * Expects the run to already be in `reconciling` state (placed there by
 * `AnalyzeOrchestrator` at the end of Phase 2).
 *
 * Flow: reconciling → [retrieve gherkinDoc + rules → reconcile → map to UnifiedDoc
 * → store] → review. On any error: emit error event → failed.
 */
@Injectable()
export class ReconcileOrchestrator {
  private readonly logger = new Logger(ReconcileOrchestrator.name);

  constructor(
    private readonly runsService: RunsService,
    private readonly runsEvents: RunsEventsService,
    private readonly reconciliationService: ReconciliationService
  ) {}

  /**
   * Execute the reconciliation phase for the given run.
   *
   * Expects `runId` to be in `reconciling` state. Transitions to `review` on
   * success or `failed` on any error.
   *
   * @throws {IllegalRunTransitionError} if the run is not in `reconciling` state.
   * @throws {NotFoundException} if `runId` is unknown.
   */
  async executeReconcile(runId: string): Promise<void> {
    const run = this.runsService.getRun(runId);

    if (run.status !== RunStatus.Reconciling) {
      throw new IllegalRunTransitionError(run.status, RunStatus.Review);
    }

    this.emitEvent(runId, 'observation', 'Starting reconciliation of Gherkin and business rules');
    this.logger.log(`Run ${runId}: reconciliation starting`);

    try {
      const gherkinDoc = run.gherkinDoc;
      const rules = run.businessRules ?? [];

      if (!gherkinDoc) {
        throw new Error('No Gherkin document found on run — Phase 1 must complete first');
      }

      this.emitEvent(
        runId,
        'observation',
        `Reconciling ${gherkinDoc.features.length} feature(s) against ${rules.length} rule(s)`,
        {
          featureCount: gherkinDoc.features.length,
          ruleCount: rules.length,
        }
      );

      const reconciledDoc = await this.reconciliationService.reconcile(gherkinDoc, rules);
      const unifiedDoc = UnifiedDocMapper.fromGherkinDoc(reconciledDoc);
      unifiedDoc.sourceRunId = runId;

      this.runsService.storeUnifiedDoc(runId, unifiedDoc);

      const scenarioCount = unifiedDoc.features.reduce((n, f) => n + f.scenarios.length, 0);
      this.emitEvent(
        runId,
        'complete',
        'Reconciliation complete — unified document ready for review',
        {
          featureCount: unifiedDoc.features.length,
          scenarioCount,
          conflictCount: unifiedDoc.conflicts.length,
        }
      );

      this.runsService.transitionRun(runId, RunStatus.Review);
      this.logger.log(`Run ${runId}: reconciling → review`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Run ${runId}: reconciliation failed — ${message}`);

      this.emitEvent(runId, 'error', `Reconciliation failed: ${message}`, { error: message });

      this.runsService.transitionRun(runId, RunStatus.Failed);
    }
  }

  private emitEvent(
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
