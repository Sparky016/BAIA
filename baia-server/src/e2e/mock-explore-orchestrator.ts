import { GherkinDoc, RunStatus } from '@baia/shared';
import { Injectable, Logger } from '@nestjs/common';

import { RunsEventsService } from '../runs/runs.events';
import { RunsService } from '../runs/runs.service';

const FAKE_GHERKIN_DOC: GherkinDoc = {
  generatedAt: new Date(),
  features: [
    {
      name: 'MyCMS Content Management',
      description: 'Core content management features of MyCMS',
      scenarios: [
        {
          name: 'View published pages as a guest',
          steps: [
            {
              keyword: 'Given',
              text: 'I navigate to the MyCMS home page',
              provenance: 'ui',
            },
            {
              keyword: 'Then',
              text: 'I see a list of published pages',
              provenance: 'ui',
            },
          ],
        },
        {
          name: 'Navigate to admin area',
          steps: [
            {
              keyword: 'Given',
              text: 'I am on the MyCMS home page',
              provenance: 'ui',
            },
            {
              keyword: 'When',
              text: 'I click the Admin navigation link',
              provenance: 'ui',
            },
            {
              keyword: 'Then',
              text: 'I see the Admin login form',
              provenance: 'ui',
            },
          ],
        },
      ],
    },
  ],
};

/**
 * E2E-only mock of ExploreOrchestrator.
 *
 * Simulates Phase 1 without launching a real Playwright browser.  Used in
 * the E2E test suite so the pipeline can run deterministically in CI without
 * requiring Chromium browser binaries to be installed.
 *
 * Produces a hard-coded GherkinDoc that mirrors what a real crawl of the
 * mock-mycms server would generate, then hands off to Phase 2 as normal.
 */
@Injectable()
export class MockExploreOrchestrator {
  private readonly logger = new Logger(MockExploreOrchestrator.name);

  constructor(
    private readonly runsService: RunsService,
    private readonly runsEvents: RunsEventsService
  ) {}

  async executePhase1(runId: string, _targetUrl: string, _instructions: string): Promise<void> {
    const run = this.runsService.getRun(runId);
    const fromStatus = run.status;

    this.runsService.transitionRun(runId, RunStatus.Exploring);
    this.runsEvents.emit(runId, {
      runId,
      from: fromStatus,
      to: RunStatus.Exploring,
      at: Date.now(),
    });
    this.logger.log(`Run ${runId}: queued → exploring (mock)`);

    // Simulate a brief crawl with progress events.
    this.runsEvents.emit(runId, {
      timestamp: new Date(),
      type: 'action',
      message: 'Navigated to mock MyCMS home page',
      details: { url: _targetUrl },
    });

    this.runsEvents.emit(runId, {
      timestamp: new Date(),
      type: 'observation',
      message: 'Captured home page with 2 published pages and a search form',
    });

    const gherkinDoc: GherkinDoc = {
      ...FAKE_GHERKIN_DOC,
      generatedAt: new Date(),
    };

    this.runsService.storeGherkinDoc(runId, gherkinDoc);

    this.runsEvents.emit(runId, {
      timestamp: new Date(),
      type: 'complete',
      message: 'Phase 1 exploration complete',
      details: { featureCount: gherkinDoc.features.length },
    });

    this.runsService.transitionRun(runId, RunStatus.Analyzing);
    this.runsEvents.emit(runId, {
      runId,
      from: RunStatus.Exploring,
      to: RunStatus.Analyzing,
      at: Date.now(),
    });
    this.logger.log(`Run ${runId}: exploring → analyzing (mock)`);
  }
}
