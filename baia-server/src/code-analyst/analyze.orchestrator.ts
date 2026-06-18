import { ExploreEvent, RunStatus } from '@baia/shared';
import { Injectable, Logger } from '@nestjs/common';

import { IllegalRunTransitionError } from '../runs/run-state-machine';
import { RunsEventsService } from '../runs/runs.events';
import { RunsService } from '../runs/runs.service';
import { CredentialStoreService } from '../security';

import { AzureConnector } from './azure-connector';
import { GitHubConnector } from './github-connector';
import { IngestionService } from './ingestion.service';
import { RepoConnector } from './repo-connector';
import { RuleExtractorService } from './rule-extractor.service';

/**
 * Orchestrates Phase 2 (Code Analyst) for a single run.
 *
 * Expects the run to already be in `analyzing` state (placed there by
 * `ExploreOrchestrator` at the end of Phase 1).
 *
 * Flow: analyzing → [auth → ingest → extract rules] → store rules →
 * reconciling. On any error: emit error event → failed.
 */
@Injectable()
export class AnalyzeOrchestrator {
  private readonly logger = new Logger(AnalyzeOrchestrator.name);

  constructor(
    private readonly runsService: RunsService,
    private readonly runsEvents: RunsEventsService,
    private readonly githubConnector: GitHubConnector,
    private readonly azureConnector: AzureConnector,
    private readonly ingestionService: IngestionService,
    private readonly ruleExtractor: RuleExtractorService,
    private readonly credentialStore: CredentialStoreService
  ) {}

  /**
   * Execute Phase 2 for the given run.
   *
   * Expects `runId` to be in `analyzing` state. Transitions to `reconciling`
   * on success or `failed` on any error.
   *
   * @throws {IllegalRunTransitionError} if the run is not in `analyzing` state.
   * @throws {NotFoundException} if `runId` is unknown.
   */
  async executePhase2(
    runId: string,
    repoUrl: string,
    repoProvider: 'github' | 'azure',
    credentialsRef: string
  ): Promise<void> {
    const run = this.runsService.getRun(runId);

    // Guard: must start from analyzing. Throws IllegalRunTransitionError before
    // any side-effects if the run is in an unexpected state.
    if (run.status !== RunStatus.Analyzing) {
      throw new IllegalRunTransitionError(run.status, RunStatus.Reconciling);
    }

    this.emitAnalyzeEvent(runId, 'observation', 'Starting Phase 2 code analysis');
    this.logger.log(`Run ${runId}: Phase 2 starting (provider=${repoProvider})`);

    try {
      const token = this.credentialStore.retrieve(credentialsRef);
      const connector = this.selectConnector(repoProvider);
      await connector.auth({ token, repoUrl });

      this.emitAnalyzeEvent(runId, 'observation', `Connected to ${repoProvider} repository`);

      const ingestedRepo = await this.ingestionService.ingestWithConnector(connector);
      this.emitAnalyzeEvent(
        runId,
        'observation',
        `Ingested ${ingestedRepo.totalChunks} chunk(s) from ${ingestedRepo.files.length} file(s)`,
        { totalChunks: ingestedRepo.totalChunks, fileCount: ingestedRepo.files.length }
      );

      const rules = await this.ruleExtractor.extractRules(ingestedRepo);
      this.emitAnalyzeEvent(runId, 'observation', `Extracted ${rules.length} business rule(s)`, {
        ruleCount: rules.length,
      });

      this.runsService.storeBusinessRules(runId, rules);

      this.emitAnalyzeEvent(runId, 'complete', 'Phase 2 analysis complete', {
        ruleCount: rules.length,
      });

      this.runsService.transitionRun(runId, RunStatus.Reconciling);
      this.runsEvents.emit(runId, {
        runId,
        from: RunStatus.Analyzing,
        to: RunStatus.Reconciling,
        at: Date.now(),
      });
      this.logger.log(`Run ${runId}: analyzing → reconciling`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Run ${runId}: Phase 2 failed — ${message}`);

      this.emitAnalyzeEvent(runId, 'error', `Phase 2 failed: ${message}`, { error: message });

      this.runsService.transitionRun(runId, RunStatus.Failed);
      this.runsEvents.emit(runId, {
        runId,
        from: RunStatus.Analyzing,
        to: RunStatus.Failed,
        at: Date.now(),
      });
    }
  }

  private selectConnector(repoProvider: 'github' | 'azure'): RepoConnector {
    return repoProvider === 'azure' ? this.azureConnector : this.githubConnector;
  }

  private emitAnalyzeEvent(
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
