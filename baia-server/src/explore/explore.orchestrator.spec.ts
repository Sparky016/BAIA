import { GherkinDoc, RunStatus } from '@baia/shared';
import { Logger } from '@nestjs/common';
import { Page } from 'playwright';

import { ConfigService } from '../config/config.service';
import { GherkinGeneratorService } from '../gherkin/gherkin-generator.service';
import { OutputWriterService } from '../output/output-writer.service';
import { RunTransitionEvent } from '../runs/run-events.types';
import { RunStateMachine } from '../runs/run-state-machine';
import { RunsEventsService, RunStreamEvent } from '../runs/runs.events';
import { RunsService } from '../runs/runs.service';

import { ActionExecutorService, ActionResult } from './action-executor.service';
import { ActionPlannerService, StepPlannerResult } from './action-planner.service';
import { CrawlCaptureService, CapturedStep, ExploreTrace } from './crawl-capture.service';
import { ExploreOrchestrator } from './explore.orchestrator';
import { ExitGateService, ExitDecision } from './exit-gate.service';
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
    ok: true,
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

/** Build sequential mock step-planner results: N click actions then goalReached. */
function makeStepResults(actionCount = 1): StepPlannerResult[] {
  const actions = Array.from({ length: actionCount }, (_, i): StepPlannerResult => ({
    action: { type: 'click', selector: `#btn-${i}` },
    goalReached: false,
    pageDescription: `Page for step ${i}`,
  }));
  return [
    ...actions,
    { action: null, goalReached: true, pageDescription: 'Goal reached page' },
  ];
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
  let exitGate: jest.Mocked<ExitGateService>;
  let mockPage: ReturnType<typeof makeMockPage>;
  let mockConfigService: jest.Mocked<ConfigService>;

  const RUN_REQUEST = {
    targetUrl: 'https://example.com',
    instructions: 'Click the button',
    repoUrl: 'https://github.com/org/repo',
    repoProvider: 'github' as const,
    credentialsRef: 'creds-1',
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    const mockOutputWriter = {
      initRun: jest.fn(),
      updateRunSummary: jest.fn(),
      appendEvent: jest.fn(),
      saveScreenshot: jest.fn(),
      saveGherkinDoc: jest.fn(),
    } as unknown as OutputWriterService;

    runsEvents = new RunsEventsService(mockOutputWriter);
    const stateMachine = new RunStateMachine();
    stateMachine.onTransition(e => runsEvents.emit(e.runId, e));
    runsService = new RunsService(stateMachine, mockOutputWriter);

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
      planNextStep: jest.fn(),
    } as unknown as jest.Mocked<ActionPlannerService>;

    crawler = {
      createTrace: jest.fn(),
      captureStep: jest.fn(),
      startNetworkCapture: jest.fn(),
    } as unknown as jest.Mocked<CrawlCaptureService>;

    gherkinGen = {
      generateGherkin: jest.fn(),
    } as unknown as jest.Mocked<GherkinGeneratorService>;

    exitGate = {
      checkStep: jest.fn().mockReturnValue({ shouldExit: false, exitReason: null, message: 'Continue' }),
    } as unknown as jest.Mocked<ExitGateService>;

    mockConfigService = {
      exploreMaxSteps: 20,
      explorePhaseTimeoutMs: 600_000,
    } as unknown as jest.Mocked<ConfigService>;

    orchestrator = new ExploreOrchestrator(
      runsService,
      runsEvents,
      runner,
      executor,
      planner,
      crawler,
      gherkinGen,
      mockOutputWriter,
      exitGate,
      mockConfigService
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

      makeStepResults(2).forEach((r) => (planner.planNextStep as jest.Mock).mockResolvedValueOnce(r));
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

    it('captures one step per perceive-plan-act iteration', () => {
      // 2 action iterations + 1 goal-reached iteration = 3 total captureStep calls
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
      (planner.planNextStep as jest.Mock).mockRejectedValue(new Error('LLM unavailable'));

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

  // ── Exit gate ─────────────────────────────────────────────────────────────

  describe('exit gate', () => {
    function setupHappyPathMocks(runId: string, actionCount = 3) {
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
      makeStepResults(actionCount).forEach((r) => (planner.planNextStep as jest.Mock).mockResolvedValueOnce(r));
      gherkinGen.generateGherkin.mockResolvedValue(makeGherkinDoc());
    }

    describe('404-detected', () => {
      let runId: string;
      let collectedEvents: RunStreamEvent[];

      beforeEach(async () => {
        collectedEvents = [];
        const run = runsService.createRun(RUN_REQUEST);
        runId = run.runId;
        setupHappyPathMocks(runId, 3);

        // Exit gate triggers on first action step
        exitGate.checkStep.mockImplementation((steps) => {
          if (steps.length >= 1) {
            return { shouldExit: true, exitReason: '404-detected', message: 'Exit gate: 404 page detected at https://example.com' } as ExitDecision;
          }
          return { shouldExit: false, exitReason: null, message: 'Continue' };
        });

        runsEvents.stream(runId).subscribe((e) => collectedEvents.push(e));
        await orchestrator.executePhase1(runId, RUN_REQUEST.targetUrl, RUN_REQUEST.instructions);
      });

      it('breaks the loop early — only 1 action executed instead of 3', () => {
        // navigate (initial) + 1 action = 2 executor calls
        const actionCalls = (executor.execute as jest.Mock).mock.calls.filter(
          ([, action]) => action.type !== 'navigate'
        );
        expect(actionCalls).toHaveLength(1);
      });

      it('emits an observation event with exitReason 404-detected', () => {
        const exitEvent = collectedEvents.find(
          (e) => 'type' in e && (e as { type: string; details?: Record<string, unknown> }).type === 'observation' &&
            (e as { details?: Record<string, unknown> }).details?.exitReason === '404-detected'
        );
        expect(exitEvent).toBeDefined();
      });

      it('still transitions to analyzing (soft stop)', () => {
        const run = runsService.getRun(runId);
        expect(run.status).toBe(RunStatus.Analyzing);
      });
    });

    describe('repeated-result', () => {
      let runId: string;
      let collectedEvents: RunStreamEvent[];

      beforeEach(async () => {
        collectedEvents = [];
        const run = runsService.createRun(RUN_REQUEST);
        runId = run.runId;
        setupHappyPathMocks(runId, 4);

        // Exit gate triggers after 2nd action step (initial step + 2 action steps = length 3)
        exitGate.checkStep.mockImplementation((steps) => {
          if (steps.length >= 3) {
            return { shouldExit: true, exitReason: 'repeated-result', message: 'Exit gate: same result observed 3 times in a row' } as ExitDecision;
          }
          return { shouldExit: false, exitReason: null, message: 'Continue' };
        });

        runsEvents.stream(runId).subscribe((e) => collectedEvents.push(e));
        await orchestrator.executePhase1(runId, RUN_REQUEST.targetUrl, RUN_REQUEST.instructions);
      });

      it('breaks the loop early — only 3 actions executed instead of 4', () => {
        const actionCalls = (executor.execute as jest.Mock).mock.calls.filter(
          ([, action]) => action.type !== 'navigate'
        );
        expect(actionCalls).toHaveLength(3);
      });

      it('emits an observation event with exitReason repeated-result', () => {
        const exitEvent = collectedEvents.find(
          (e) => 'type' in e && (e as { type: string; details?: Record<string, unknown> }).type === 'observation' &&
            (e as { details?: Record<string, unknown> }).details?.exitReason === 'repeated-result'
        );
        expect(exitEvent).toBeDefined();
      });

      it('still transitions to analyzing (soft stop)', () => {
        const run = runsService.getRun(runId);
        expect(run.status).toBe(RunStatus.Analyzing);
      });
    });

    describe('success-criteria-reached (planner-level)', () => {
      let runId: string;
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
        gherkinGen.generateGherkin.mockResolvedValue(makeGherkinDoc());

        // Planner signals goal-reached on the first step
        (planner.planNextStep as jest.Mock).mockResolvedValue({
          action: null,
          goalReached: true,
          pageDescription: 'Goal already achieved',
        });

        runsEvents.stream(runId).subscribe((e) => collectedEvents.push(e));
        await orchestrator.executePhase1(runId, RUN_REQUEST.targetUrl, RUN_REQUEST.instructions);
      });

      it('emits an observation event with exitReason success-criteria-reached', () => {
        const exitEvent = collectedEvents.find(
          (e) => 'type' in e && (e as { type: string; details?: Record<string, unknown> }).type === 'observation' &&
            (e as { details?: Record<string, unknown> }).details?.exitReason === 'success-criteria-reached'
        );
        expect(exitEvent).toBeDefined();
      });

      it('continues to analyzing normally', () => {
        const run = runsService.getRun(runId);
        expect(run.status).toBe(RunStatus.Analyzing);
      });
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

  // ── Budget exhaustion ─────────────────────────────────────────────────────

  describe('budget exhaustion', () => {
    it('emits a distinct budget-exhausted event when MAX_STEPS is reached without goal', async () => {
      // Set a tiny budget so we can exhaust it quickly
      (mockConfigService as unknown as { exploreMaxSteps: number }).exploreMaxSteps = 3;
      (mockConfigService as unknown as { explorePhaseTimeoutMs: number }).explorePhaseTimeoutMs = 600_000;

      const run = runsService.createRun(RUN_REQUEST);
      const runId = run.runId;
      const collectedEvents: RunStreamEvent[] = [];

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

      // Never return goalReached — always return an action to execute
      (planner.planNextStep as jest.Mock).mockResolvedValue({
        action: { type: 'click', selector: '#btn' },
        goalReached: false,
        pageDescription: 'Still working...',
      });
      gherkinGen.generateGherkin.mockResolvedValue(makeGherkinDoc());

      runsEvents.stream(runId).subscribe((e) => collectedEvents.push(e));
      await orchestrator.executePhase1(runId, RUN_REQUEST.targetUrl, RUN_REQUEST.instructions);

      const budgetEvent = collectedEvents.find(
        (e) =>
          'type' in e &&
          (e as { type: string; details?: Record<string, unknown> }).type === 'observation' &&
          (e as { details?: Record<string, unknown> }).details?.exitReason === 'max-steps'
      );
      expect(budgetEvent).toBeDefined();
    });
  });

  // ── Phase timeout ─────────────────────────────────────────────────────────

  describe('phase timeout', () => {
    it('emits a timeout event when phase timeout is exceeded', async () => {
      // Set a timeout of 0ms so it triggers immediately on the second iteration
      (mockConfigService as unknown as { exploreMaxSteps: number }).exploreMaxSteps = 20;
      (mockConfigService as unknown as { explorePhaseTimeoutMs: number }).explorePhaseTimeoutMs = 0;

      const run = runsService.createRun(RUN_REQUEST);
      const runId = run.runId;
      const collectedEvents: RunStreamEvent[] = [];

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

      // Never return goalReached — always return an action to execute
      (planner.planNextStep as jest.Mock).mockResolvedValue({
        action: { type: 'click', selector: '#btn' },
        goalReached: false,
        pageDescription: 'Still working...',
      });
      gherkinGen.generateGherkin.mockResolvedValue(makeGherkinDoc());

      runsEvents.stream(runId).subscribe((e) => collectedEvents.push(e));
      await orchestrator.executePhase1(runId, RUN_REQUEST.targetUrl, RUN_REQUEST.instructions);

      const timeoutEvent = collectedEvents.find(
        (e) =>
          'type' in e &&
          (e as { type: string; details?: Record<string, unknown> }).type === 'observation' &&
          (e as { details?: Record<string, unknown> }).details?.exitReason === 'timeout'
      );
      expect(timeoutEvent).toBeDefined();
    });
  });
});
