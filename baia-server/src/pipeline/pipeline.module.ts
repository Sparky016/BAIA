import { Module } from '@nestjs/common';
import { chromium } from 'playwright';

import { AnalyzeOrchestrator } from '../code-analyst/analyze.orchestrator';
import {
  AZURE_API_CLIENT_FACTORY,
  AzureConnector,
  buildAzureApiClientFactory,
} from '../code-analyst/azure-connector';
import { ConfigService } from '../config/config.service';
import {
  GITHUB_API_CLIENT_FACTORY,
  GitHubConnector,
  buildOctokitFactory,
} from '../code-analyst/github-connector';
import { IngestionService } from '../code-analyst/ingestion.service';
import { REPO_CONNECTOR } from '../code-analyst/repo-connector';
import { RuleExtractorService } from '../code-analyst/rule-extractor.service';
import { MockExploreOrchestrator } from '../e2e/mock-explore-orchestrator';
import { MockRepoConnector } from '../e2e/mock-repo-connector';
import { ActionExecutorService } from '../explore/action-executor.service';
import { ActionPlannerService } from '../explore/action-planner.service';
import { CrawlCaptureService } from '../explore/crawl-capture.service';
import { ExitGateService } from '../explore/exit-gate.service';
import { ExploreOrchestrator } from '../explore/explore.orchestrator';
import {
  CHROMIUM_LAUNCHER,
  DEFAULT_PLAYWRIGHT_CONFIG,
  PlaywrightRunnerService,
} from '../explore/playwright-runner.service';
import { GherkinModule } from '../gherkin/gherkin.module';
import { LlmModule } from '../llm/llm.module';
import { ReconcileOrchestrator } from '../reconcile/reconcile.orchestrator';
import { ReconciliationService } from '../reconcile/reconciliation.service';
import { RunsModule } from '../runs/runs.module';
import { SecurityModule } from '../security/security.module';

import { PipelineService } from './pipeline.service';
import { StartController } from './start.controller';

const isE2e = process.env['E2E'] === 'true';

/**
 * Unified pipeline module used in both production and E2E mode.
 *
 * When `E2E=true` is set in the environment, mock implementations replace the
 * real Playwright explorer and repo connectors so the test suite runs
 * deterministically in CI without browser binaries or external credentials.
 * All other providers (LLM, security, runs state) are handled by their own
 * modules which already have env-based fallbacks (LlmModule → MockLlmService
 * when no token is configured; SecurityModule → random key when none is set).
 *
 * Do NOT import ExploreModule / CodeAnalystModule / ReconcileModule here —
 * those modules re-register RunsService locally, which would create duplicate
 * instances and break shared run state.
 */
@Module({
  imports: [RunsModule, LlmModule, GherkinModule, SecurityModule],
  controllers: [StartController],
  providers: [
    // ── Phase 1 – Explore ────────────────────────────────────────────────────
    // In E2E mode the real Playwright stack is replaced with a deterministic
    // mock that never launches a browser.
    ...(isE2e
      ? [
          MockExploreOrchestrator,
          { provide: ExploreOrchestrator, useExisting: MockExploreOrchestrator },
        ]
      : [
          { provide: CHROMIUM_LAUNCHER, useValue: chromium },
          {
            provide: PlaywrightRunnerService,
            useFactory: () => new PlaywrightRunnerService(chromium, DEFAULT_PLAYWRIGHT_CONFIG),
          },
          ActionExecutorService,
          ActionPlannerService,
          CrawlCaptureService,
          ExitGateService,
          ExploreOrchestrator,
        ]),

    // ── Phase 2 – Code Analyst ───────────────────────────────────────────────
    // In E2E mode a single MockRepoConnector stands in for all repo connector
    // slots so the ingestion pipeline exercises real logic with fake file data.
    ...(isE2e
      ? [
          MockRepoConnector,
          { provide: GitHubConnector, useExisting: MockRepoConnector },
          { provide: AzureConnector, useExisting: MockRepoConnector },
          { provide: REPO_CONNECTOR, useExisting: MockRepoConnector },
        ]
      : [
          { provide: GITHUB_API_CLIENT_FACTORY, useFactory: buildOctokitFactory },
          GitHubConnector,
          { provide: AZURE_API_CLIENT_FACTORY, useFactory: buildAzureApiClientFactory },
          AzureConnector,
          { provide: REPO_CONNECTOR, useClass: GitHubConnector },
        ]),
    IngestionService,
    RuleExtractorService,
    AnalyzeOrchestrator,

    // ── Phase 3 – Reconcile ──────────────────────────────────────────────────
    ReconciliationService,
    ReconcileOrchestrator,

    // ── Pipeline service ─────────────────────────────────────────────────────
    PipelineService,
    ConfigService,
  ],
})
export class PipelineModule {}
