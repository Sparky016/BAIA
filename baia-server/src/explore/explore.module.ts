import { Module } from '@nestjs/common';
import { chromium } from 'playwright';

import { RunsEventsService } from '../runs/runs.events';
import { ActionPlannerService } from './action-planner.service';
import { CrawlCaptureService } from './crawl-capture.service';
import {
  CHROMIUM_LAUNCHER,
  DEFAULT_PLAYWRIGHT_CONFIG,
  PlaywrightRunnerService,
} from './playwright-runner.service';

/**
 * NestJS module for the Phase 1 "Exploratory Analyst" domain.
 *
 * `CHROMIUM_LAUNCHER` is bound to `playwright.chromium` at module level so
 * that all consumers of `PlaywrightRunnerService` receive the real launcher
 * in production while tests can override it via `useValue` / `useFactory`.
 *
 * `RunsEventsService` is provided here directly because `RunsModule` does not
 * yet exist as a standalone module. Promote this to a module import once
 * `runs.module.ts` is created.
 */
@Module({
  providers: [
    {
      provide: CHROMIUM_LAUNCHER,
      useValue: chromium,
    },
    {
      provide: PlaywrightRunnerService,
      useFactory: () => new PlaywrightRunnerService(chromium, DEFAULT_PLAYWRIGHT_CONFIG),
    },
    RunsEventsService,
    ActionPlannerService,
    CrawlCaptureService,
  ],
  exports: [PlaywrightRunnerService, ActionPlannerService, CrawlCaptureService],
})
export class ExploreModule {}
