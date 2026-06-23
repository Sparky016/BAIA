import { Module } from '@nestjs/common';
import { chromium } from 'playwright';

import { AnalyzeOrchestrator } from '../code-analyst/analyze.orchestrator';
import {
  AZURE_API_CLIENT_FACTORY,
  AzureConnector,
  buildAzureApiClientFactory,
} from '../code-analyst/azure-connector';
import {
  GITHUB_API_CLIENT_FACTORY,
  GitHubConnector,
  buildOctokitFactory,
} from '../code-analyst/github-connector';
import { IngestionService } from '../code-analyst/ingestion.service';
import { REPO_CONNECTOR } from '../code-analyst/repo-connector';
import { RuleExtractorService } from '../code-analyst/rule-extractor.service';
import { PipelineService } from './pipeline.service';
import { ActionExecutorService } from '../explore/action-executor.service';
import { ActionPlannerService } from '../explore/action-planner.service';
import { CrawlCaptureService } from '../explore/crawl-capture.service';
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

import { StartController } from './start.controller';

/**
 * Production pipeline module. Registers all orchestrators and their
 * phase-specific dependencies as flat providers so they share the single
 * RunsService / RunsEventsService instances exported by RunsModule.
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
    { provide: CHROMIUM_LAUNCHER, useValue: chromium },
    {
      provide: PlaywrightRunnerService,
      useFactory: () => new PlaywrightRunnerService(chromium, DEFAULT_PLAYWRIGHT_CONFIG),
    },
    ActionExecutorService,
    ActionPlannerService,
    CrawlCaptureService,
    ExploreOrchestrator,

    // ── Phase 2 – Code Analyst ───────────────────────────────────────────────
    { provide: GITHUB_API_CLIENT_FACTORY, useFactory: buildOctokitFactory },
    GitHubConnector,
    { provide: AZURE_API_CLIENT_FACTORY, useFactory: buildAzureApiClientFactory },
    AzureConnector,
    { provide: REPO_CONNECTOR, useClass: GitHubConnector },
    IngestionService,
    RuleExtractorService,
    AnalyzeOrchestrator,

    // ── Phase 3 – Reconcile ──────────────────────────────────────────────────
    ReconciliationService,
    ReconcileOrchestrator,

    // ── Pipeline service ─────────────────────────────────────────────────────
    PipelineService,
  ],
})
export class PipelineModule {}
