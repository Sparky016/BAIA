import { BusinessRule, ExploreEvent, RunStatus } from '@baia/shared';
import { Injectable, Logger } from '@nestjs/common';

import { OutputWriterService } from '../output/output-writer.service';
import { IllegalRunTransitionError } from '../runs/run-state-machine';
import { RunsEventsService } from '../runs/runs.events';
import { RunsService } from '../runs/runs.service';
import { CredentialStoreService } from '../security';
import { redactString } from '../security/redaction';

import { toUserMessage } from '../common/user-facing-error';

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
    private readonly credentialStore: CredentialStoreService,
    private readonly outputWriter: OutputWriterService
  ) {}

  /**
   * Execute Phase 2 for the given run.
   *
   * Expects `runId` to be in `analyzing` state. When repo params are omitted
   * the code-analysis step is skipped and the run advances directly to
   * `reconciling` with no business rules.  Transitions to `failed` on error.
   *
   * @throws {IllegalRunTransitionError} if the run is not in `analyzing` state.
   * @throws {NotFoundException} if `runId` is unknown.
   */
  async executePhase2(
    runId: string,
    repoUrl?: string,
    repoProvider?: 'github' | 'azure',
    credentialsRef?: string
  ): Promise<void> {
    const run = this.runsService.getRun(runId);

    // Guard: must start from analyzing. Throws IllegalRunTransitionError before
    // any side-effects if the run is in an unexpected state.
    if (run.status !== RunStatus.Analyzing) {
      throw new IllegalRunTransitionError(run.status, RunStatus.Reconciling);
    }

    if (!repoUrl || !repoProvider || !credentialsRef) {
      this.emitAnalyzeEvent(
        runId,
        'observation',
        'Skipping code analysis — no repository provided'
      );
      this.logger.log(`Run ${runId}: Phase 2 skipped (no repo params)`);
      this.runsService.transitionRun(runId, RunStatus.Reconciling);
      return;
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

      // Redact secrets that may appear in LLM-extracted rule text before
      // persisting to the run store or the output file.
      const redactedRules: BusinessRule[] = rules.map((rule) => ({
        ...rule,
        description: redactString(rule.description),
        category: redactString(rule.category),
      }));

      this.runsService.storeBusinessRules(runId, redactedRules);
      await this.outputWriter.saveBusinessRules(runId, redactedRules);

      this.emitAnalyzeEvent(runId, 'complete', 'Phase 2 analysis complete', {
        ruleCount: redactedRules.length,
      });

      this.runsService.transitionRun(runId, RunStatus.Reconciling);
      this.logger.log(`Run ${runId}: analyzing → reconciling`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Run ${runId}: Phase 2 failed — ${message}`);

      this.emitAnalyzeEvent(runId, 'error', toUserMessage(err, 'Phase 2 (Analyze)'), {
        error: message,
      });

      this.runsService.transitionRun(runId, RunStatus.Failed);
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
