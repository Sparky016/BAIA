import { Module } from '@nestjs/common';
import { chromium } from 'playwright';

import { GherkinModule } from '../gherkin/gherkin.module';
import { RunStateMachine } from '../runs/run-state-machine';
import { RunsEventsService } from '../runs/runs.events';
import { RunsService } from '../runs/runs.service';

import { ActionExecutorService } from './action-executor.service';
import { ActionPlannerService } from './action-planner.service';
import { CrawlCaptureService } from './crawl-capture.service';
import { ExploreOrchestrator } from './explore.orchestrator';
import {
  CHROMIUM_LAUNCHER,
  DEFAULT_PLAYWRIGHT_CONFIG,
  PlaywrightRunnerService,
} from './playwright-runner.service';

@Module({
  imports: [GherkinModule],
  providers: [
    {
      provide: CHROMIUM_LAUNCHER,
      useValue: chromium,
    },
    {
      provide: PlaywrightRunnerService,
      useFactory: () => new PlaywrightRunnerService(chromium, DEFAULT_PLAYWRIGHT_CONFIG),
    },
    RunStateMachine,
    RunsService,
    RunsEventsService,
    ActionExecutorService,
    ActionPlannerService,
    CrawlCaptureService,
    ExploreOrchestrator,
  ],
  exports: [
    PlaywrightRunnerService,
    ActionExecutorService,
    ActionPlannerService,
    CrawlCaptureService,
    ExploreOrchestrator,
  ],
})
export class ExploreModule {}
