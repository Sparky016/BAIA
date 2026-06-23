import { Module } from '@nestjs/common';

import { AnalyzeOrchestrator } from '../code-analyst/analyze.orchestrator';
import { AzureConnector } from '../code-analyst/azure-connector';
import { GitHubConnector } from '../code-analyst/github-connector';
import { IngestionService } from '../code-analyst/ingestion.service';
import { REPO_CONNECTOR } from '../code-analyst/repo-connector';
import { RuleExtractorService } from '../code-analyst/rule-extractor.service';
import { ExploreOrchestrator } from '../explore/explore.orchestrator';
import { ConfluenceAdapter } from '../export/confluence.adapter';
import { ExportController } from '../export/export.controller';
import { GherkinGeneratorService } from '../gherkin/gherkin-generator.service';
import { LLM_SERVICE } from '../llm/llm.constants';
import { MockLlmService } from '../llm/mock-llm.service';
import { ReconcileOrchestrator } from '../reconcile/reconcile.orchestrator';
import { ReconciliationService } from '../reconcile/reconciliation.service';
import { RunStateMachine } from '../runs/run-state-machine';
import { RunsController } from '../runs/runs.controller';
import { RunsEventsService } from '../runs/runs.events';
import { RunsService } from '../runs/runs.service';
import { RunsSseController } from '../runs/runs.sse.controller';
import {
  CREDENTIAL_ENCRYPTION_KEY,
  CredentialStoreService,
} from '../security/credential-store.service';

import { PipelineService } from '../pipeline/pipeline.service';

import { E2eStartController } from './e2e-start.controller';
import { MockExploreOrchestrator } from './mock-explore-orchestrator';
import { MockRepoConnector } from './mock-repo-connector';

/**
 * Full NestJS module used exclusively for E2E tests.
 *
 * All providers are registered as module-level singletons so that shared
 * state (RunsService, RunsEventsService, CredentialStoreService) is correctly
 * shared across controllers and orchestrators.
 *
 * The Playwright runner and LLM adapter are replaced with deterministic mocks
 * so the test suite runs headlessly in CI without external credentials or
 * browser binaries beyond what is already installed with the repo.
 *
 * No production code imports this module.
 */
@Module({
  controllers: [RunsController, RunsSseController, ExportController, E2eStartController],
  providers: [
    // ── Shared run state (single instances) ─────────────────────────────────
    // RunStateMachine takes an optional Clock function; bypass NestJS DI with
    // useFactory so the default clock is used without requiring a provider.
    { provide: RunStateMachine, useFactory: () => new RunStateMachine() },
    RunsService,
    RunsEventsService,

    // ── Security ─────────────────────────────────────────────────────────────
    {
      provide: CREDENTIAL_ENCRYPTION_KEY,
      useValue: process.env['CREDENTIAL_ENCRYPTION_KEY'] ?? 'e2e-test-key-padding-32-chars-ok!',
    },
    CredentialStoreService,

    // ── LLM (deterministic mock — no Copilot SDK required) ───────────────────
    { provide: LLM_SERVICE, useClass: MockLlmService },

    // ── Gherkin (used by ReconciliationService) ───────────────────────────────
    GherkinGeneratorService,

    // ── Phase 1 – Explore (browser-free mock) ────────────────────────────────
    // MockExploreOrchestrator simulates Phase 1 without launching Chromium,
    // making the suite deterministic in CI without browser binary downloads.
    MockExploreOrchestrator,
    { provide: ExploreOrchestrator, useExisting: MockExploreOrchestrator },

    // ── Phase 2 – Code Analyst (mock repo connector) ─────────────────────────
    MockRepoConnector,
    { provide: GitHubConnector, useExisting: MockRepoConnector },
    { provide: AzureConnector, useExisting: MockRepoConnector },
    { provide: REPO_CONNECTOR, useExisting: MockRepoConnector },
    IngestionService,
    RuleExtractorService,
    AnalyzeOrchestrator,

    // ── Phase 3 – Reconcile ──────────────────────────────────────────────────
    ReconciliationService,
    ReconcileOrchestrator,

    // ── Export ───────────────────────────────────────────────────────────────
    ConfluenceAdapter,

    // ── Pipeline service + start controller ──────────────────────────────────
    PipelineService,
  ],
})
export class E2eAppModule {}
