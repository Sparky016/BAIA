import { GherkinDoc, RunStatus } from '@baia/shared';
import { Logger } from '@nestjs/common';
import { Page } from 'playwright';

import { GherkinGeneratorService } from '../gherkin/gherkin-generator.service';
import { RunTransitionEvent } from '../runs/run-events.types';
import { RunStateMachine } from '../runs/run-state-machine';
import { RunsEventsService, RunStreamEvent } from '../runs/runs.events';
import { RunsService } from '../runs/runs.service';

import { ActionExecutorService, ActionResult } from './action-executor.service';
import { ActionPlannerService, ActionPlannerResult } from './action-planner.service';
import { CrawlCaptureService, CapturedStep, ExploreTrace } from './crawl-capture.service';
import { ExploreOrchestrator } from './explore.orchestrator';
import { PlaywrightRunnerService } from './playwright-runner.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockPage(url = 'https://example.com'): jest.Mocked<Pick<Page, 'url'>> {
  return { url: jest.fn().mockReturnValue(url) } as unknown as jest.Mocked<Pick<Page, 'url'>>;
}

function makeStep(index: number): CapturedStep {
  return {
    stepIndex: index,
    timestamp: new Date(),
    url: 'https://example.com',
    domSnapshot: `<html>step${index}</html>`,
    networkEvents: [],
    observation: `observation ${index}`,
  };
}

function makeGherkinDoc(): GherkinDoc {
  return {
    features: [
      {
        name: 'Test Feature',
        scenarios: [
          {
            name: 'Test Scenario',
            steps: [{ keyword: 'Given', text: 'something', provenance: 'ui' }],
          },
        ],
      },
    ],
    generatedAt: new Date(),
  };
}

function makeTrace(runId: string): ExploreTrace {
  return { runId, steps: [], startedAt: new Date() };
}

function makeNavResult(url = 'https://example.com'): ActionResult {
  return { ok: true, observation: `Navigated to ${url}` };
}

function makePlanResult(actionCount = 1): ActionPlannerResult {
  const actions = Array.from({ length: actionCount }, (_, i) => ({
    type: 'click' as const,
    selector: `#btn-${i}`,
  }));
  return { actions, goalSummary: 'Test goal', stepsUsed: actionCount, stopReason: 'goal-reached' };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ExploreOrchestrator', () => {
  let orchestrator: ExploreOrchestrator;
  let runsService: RunsService;
  let runsEvents: RunsEventsService;
  let runner: jest.Mocked<PlaywrightRunnerService>;
  let executor: jest.Mocked<ActionExecutorService>;
  let planner: jest.Mocked<ActionPlannerService>;
  let crawler: jest.Mocked<CrawlCaptureService>;
  let gherkinGen: jest.Mocked<GherkinGeneratorService>;
  let mockPage: ReturnType<typeof makeMockPage>;

  const RUN_REQUEST = {
    targetUrl: 'https://example.com',
    instructions: 'Click the button',
    repoUrl: 'https://github.com/org/repo',
    repoProvider: 'github' as const,
    credentialsRef: 'creds-1',
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    const stateMachine = new RunStateMachine();
    runsService = new RunsService(stateMachine);
    runsEvents = new RunsEventsService();

    mockPage = makeMockPage(RUN_REQUEST.targetUrl);

    runner = {
      launch: jest.fn().mockResolvedValue(undefined),
      teardown: jest.fn().mockResolvedValue(undefined),
      getPage: jest.fn().mockReturnValue(mockPage),
      navigate: jest.fn(),
      captureScreenshot: jest.fn(),
      withTeardown: jest.fn(),
    } as unknown as jest.Mocked<PlaywrightRunnerService>;

    executor = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ActionExecutorService>;

    planner = {
      planActions: jest.fn(),
    } as unknown as jest.Mocked<ActionPlannerService>;

    crawler = {
      createTrace: jest.fn(),
      captureStep: jest.fn(),
      startNetworkCapture: jest.fn(),
    } as unknown as jest.Mocked<CrawlCaptureService>;

    gherkinGen = {
      generateGherkin: jest.fn(),
    } as unknown as jest.Mocked<GherkinGeneratorService>;

    orchestrator = new ExploreOrchestrator(
      runsService,
      runsEvents,
      runner,
      executor,
      planner,
      crawler,
      gherkinGen
    );
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  describe('happy path', () => {
    let runId: string;
    const gherkinDoc = makeGherkinDoc();
    let collectedEvents: RunStreamEvent[];

    beforeEach(async () => {
      collectedEvents = [];
      const run = runsService.createRun(RUN_REQUEST);
      runId = run.runId;

      const trace = makeTrace(runId);
      crawler.createTrace.mockReturnValue(trace);
      crawler.captureStep.mockImplementation(async (_rid, _page, stepIndex) => makeStep(stepIndex));

      executor.execute.mockImplementation(async (_page, action) => {
        if (action.type === 'navigate') return makeNavResult();
        return { ok: true, observation: `executed ${action.type}` };
      });

      runner.captureScreenshot.mockResolvedValue({
        url: 'https://example.com',
        data: Buffer.from('fake-png'),
      });

      planner.planActions.mockResolvedValue(makePlanResult(2));
      gherkinGen.generateGherkin.mockResolvedValue(gherkinDoc);

      runsEvents.stream(runId).subscribe((e) => collectedEvents.push(e));

      await orchestrator.executePhase1(runId, RUN_REQUEST.targetUrl, RUN_REQUEST.instructions);
    });

    it('transitions run to analyzing', () => {
      const run = runsService.getRun(runId);
      expect(run.status).toBe(RunStatus.Analyzing);
    });

    it('stores gherkin doc on run', () => {
      const run = runsService.getRun(runId);
      expect(run.gherkinDoc).toEqual(gherkinDoc);
    });

    it('emits queued→exploring transition event', () => {
      const transition = collectedEvents.find(
        (e): e is RunTransitionEvent =>
          'to' in e && (e as RunTransitionEvent).to === RunStatus.Exploring
      );
      expect(transition).toBeDefined();
      expect(transition!.from).toBe(RunStatus.Queued);
    });

    it('emits exploring→analyzing transition event', () => {
      const transition = collectedEvents.find(
        (e): e is RunTransitionEvent =>
          'to' in e && (e as RunTransitionEvent).to === RunStatus.Analyzing
      );
      expect(transition).toBeDefined();
      expect(transition!.from).toBe(RunStatus.Exploring);
    });

    it('emits observation events from crawl capture', () => {
      const observations = collectedEvents.filter(
        (e) => 'type' in e && (e as { type: string }).type === 'observation'
      );
      expect(observations.length).toBeGreaterThan(0);
    });

    it('emits action events for each planned action', () => {
      const actionEvents = collectedEvents.filter(
        (e) => 'type' in e && (e as { type: string }).type === 'action'
      );
      expect(actionEvents).toHaveLength(2);
    });

    it('emits complete event', () => {
      const complete = collectedEvents.find(
        (e) => 'type' in e && (e as { type: string }).type === 'complete'
      );
      expect(complete).toBeDefined();
    });

    it('launches and tears down the browser', () => {
      expect(runner.launch).toHaveBeenCalledTimes(1);
      expect(runner.teardown).toHaveBeenCalledTimes(1);
    });

    it('captures initial step + one step per action', () => {
      // 1 initial (nav) + 2 action steps = 3 total captureStep calls
      expect(crawler.captureStep).toHaveBeenCalledTimes(3);
    });
  });

  // ── Failure path ───────────────────────────────────────────────────────────

  describe('failure path', () => {
    let runId: string;
    let collectedEvents: RunStreamEvent[];

    beforeEach(async () => {
      collectedEvents = [];
      const run = runsService.createRun(RUN_REQUEST);
      runId = run.runId;

      const trace = makeTrace(runId);
      crawler.createTrace.mockReturnValue(trace);

      // Navigation succeeds but planner throws
      executor.execute.mockResolvedValue(makeNavResult());
      crawler.captureStep.mockResolvedValue(makeStep(0));
      runner.captureScreenshot.mockResolvedValue({
        url: 'https://example.com',
        data: Buffer.from('fake-png'),
      });
      planner.planActions.mockRejectedValue(new Error('LLM unavailable'));

      runsEvents.stream(runId).subscribe((e) => collectedEvents.push(e));

      // executePhase1 now rethrows after handling the failure — absorb it here.
      await orchestrator.executePhase1(runId, RUN_REQUEST.targetUrl, RUN_REQUEST.instructions).catch(() => {});
    });

    it('transitions run to failed', () => {
      const run = runsService.getRun(runId);
      expect(run.status).toBe(RunStatus.Failed);
    });

    it('emits error event before terminal transition', () => {
      const errorIdx = collectedEvents.findIndex(
        (e) => 'type' in e && (e as { type: string }).type === 'error'
      );
      const failedIdx = collectedEvents.findIndex(
        (e): e is RunTransitionEvent =>
          'to' in e && (e as RunTransitionEvent).to === RunStatus.Failed
      );
      expect(errorIdx).toBeGreaterThanOrEqual(0);
      expect(failedIdx).toBeGreaterThan(errorIdx);
    });

    it('error event includes failure message', () => {
      const errorEvent = collectedEvents.find(
        (e) => 'type' in e && (e as { type: string }).type === 'error'
      ) as { message: string } | undefined;
      expect(errorEvent?.message).toContain('LLM unavailable');
    });

    it('emits exploring→failed transition', () => {
      const transition = collectedEvents.find(
        (e): e is RunTransitionEvent =>
          'to' in e && (e as RunTransitionEvent).to === RunStatus.Failed
      );
      expect(transition?.from).toBe(RunStatus.Exploring);
    });

    it('always tears down the browser', () => {
      expect(runner.teardown).toHaveBeenCalledTimes(1);
    });

    it('does not store gherkin doc on failed run', () => {
      const run = runsService.getRun(runId);
      expect(run.gherkinDoc).toBeUndefined();
    });
  });

  // ── Guard: illegal initial state ───────────────────────────────────────────

  describe('when run is not in queued state', () => {
    it('throws IllegalRunTransitionError without entering try block', async () => {
      const run = runsService.createRun(RUN_REQUEST);
      // Manually advance to exploring so the transition to Exploring again is illegal
      runsService.transitionRun(run.runId, RunStatus.Exploring);

      await expect(
        orchestrator.executePhase1(run.runId, RUN_REQUEST.targetUrl, RUN_REQUEST.instructions)
      ).rejects.toThrow('Illegal run transition');

      // Browser should NOT have been launched since the error is pre-try
      expect(runner.launch).not.toHaveBeenCalled();
    });
  });
});
