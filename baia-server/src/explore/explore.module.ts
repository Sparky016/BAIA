import { Module } from '@nestjs/common';
import { chromium } from 'playwright';

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
  ],
  exports: [PlaywrightRunnerService],
})
export class ExploreModule {}
