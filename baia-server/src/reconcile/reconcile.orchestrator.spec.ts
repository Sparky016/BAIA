import { BusinessRule, GherkinDoc, RunStatus } from '@baia/shared';
import { Logger } from '@nestjs/common';

import { IllegalRunTransitionError } from '../runs/run-state-machine';
import { RunStateMachine } from '../runs/run-state-machine';
import { RunsEventsService, RunStreamEvent } from '../runs/runs.events';
import { RunsService } from '../runs/runs.service';

import { ReconcileOrchestrator } from './reconcile.orchestrator';
import { ReconciliationService } from './reconciliation.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUN_REQUEST = {
  targetUrl: 'https://example.com',
  instructions: 'Explore the app',
  repoUrl: 'https://github.com/org/repo',
  repoProvider: 'github' as const,
  credentialsRef: 'creds-ref-1',
};

function makeGherkinDoc(featureCount = 1, scenariosPerFeature = 2): GherkinDoc {
  return {
    features: Array.from({ length: featureCount }, (_, fi) => ({
      name: `Feature ${fi}`,
      scenarios: Array.from({ length: scenariosPerFeature }, (_, si) => ({
        name: `Scenario ${fi}-${si}`,
        steps: [
          { keyword: 'Given' as const, text: 'the user is on the page', provenance: 'ui' as const },
          { keyword: 'When' as const, text: 'the user clicks submit', provenance: 'ui' as const },
          { keyword: 'Then' as const, text: 'the form is submitted', provenance: 'ui' as const },
        ],
      })),
    })),
    generatedAt: new Date(),
  };
}

function makeBusinessRules(count = 2): BusinessRule[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `rule-${i}`,
    description: `Rule ${i} description`,
    category: 'validation',
    sourceRef: `src/file${i}.ts:chunk0`,
  }));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ReconcileOrchestrator', () => {
  let orchestrator: ReconcileOrchestrator;
  let runsService: RunsService;
  let runsEvents: RunsEventsService;
  let reconciliationService: jest.Mocked<Pick<ReconciliationService, 'reconcile'>>;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    runsEvents = new RunsEventsService();
    const stateMachine = new RunStateMachine();
    stateMachine.onTransition(e => runsEvents.emit(e.runId, e));
    runsService = new RunsService(stateMachine);

    reconciliationService = {
      reconcile: jest.fn(),
    };

    orchestrator = new ReconcileOrchestrator(
      runsService,
      runsEvents,
      reconciliationService as unknown as ReconciliationService
    );
  });

  /** Advance a run to `reconciling` with stored gherkinDoc and businessRules. */
  function createReconcilingRun(gherkinDoc?: GherkinDoc, rules?: BusinessRule[]): string {
    const run = runsService.createRun(RUN_REQUEST);
    runsService.transitionRun(run.runId, RunStatus.Exploring);
    runsService.transitionRun(run.runId, RunStatus.Analyzing);
    runsService.transitionRun(run.runId, RunStatus.Reconciling);

    if (gherkinDoc) {
      runsService.storeGherkinDoc(run.runId, gherkinDoc);
    }
    if (rules) {
      runsService.storeBusinessRules(run.runId, rules);
    }
    return run.runId;
  }

  // ── Happy path ─────────────────────────────────────────────────────────────

  describe('happy path', () => {
    let runId: string;
    let collectedEvents: RunStreamEvent[];
    const gherkinDoc = makeGherkinDoc(1, 2);
    const rules = makeBusinessRules(3);
    const reconciledDoc = makeGherkinDoc(1, 3);

    beforeEach(async () => {
      collectedEvents = [];
      runId = createReconcilingRun(gherkinDoc, rules);

      reconciliationService.reconcile.mockResolvedValue(reconciledDoc);

      runsEvents.stream(runId).subscribe((e) => collectedEvents.push(e));

      await orchestrator.executeReconcile(runId);
    });

    it('transitions run to review', () => {
      expect(runsService.getRun(runId).status).toBe(RunStatus.Review);
    });

    it('stores unified doc on the run', () => {
      const unifiedDoc = runsService.getRun(runId).unifiedDoc;
      expect(unifiedDoc).toBeDefined();
      expect(unifiedDoc!.features).toHaveLength(reconciledDoc.features.length);
    });

    it('sets sourceRunId on the unified doc', () => {
      expect(runsService.getRun(runId).unifiedDoc!.sourceRunId).toBe(runId);
    });

    it('calls reconcile with the stored gherkinDoc and rules', () => {
      expect(reconciliationService.reconcile).toHaveBeenCalledWith(gherkinDoc, rules);
    });

    it('emits reconciling→review transition event', () => {
      const transition = collectedEvents.find(
        (e) => 'to' in e && (e as { to: RunStatus }).to === RunStatus.Review
      );
      expect(transition).toBeDefined();
      expect((transition as { from: RunStatus }).from).toBe(RunStatus.Reconciling);
    });

    it('emits observation events during the phase', () => {
      const observations = collectedEvents.filter(
        (e) => 'type' in e && (e as { type: string }).type === 'observation'
      );
      expect(observations.length).toBeGreaterThanOrEqual(2);
    });

    it('emits a complete event', () => {
      const complete = collectedEvents.find(
        (e) => 'type' in e && (e as { type: string }).type === 'complete'
      );
      expect(complete).toBeDefined();
    });

    it('complete event includes featureCount and scenarioCount', () => {
      const complete = collectedEvents.find(
        (e) => 'type' in e && (e as { type: string }).type === 'complete'
      ) as { details?: Record<string, unknown> } | undefined;
      expect(complete?.details?.['featureCount']).toBe(reconciledDoc.features.length);
      expect(typeof complete?.details?.['scenarioCount']).toBe('number');
    });
  });

  // ── Empty business rules ───────────────────────────────────────────────────

  describe('when run has no business rules stored', () => {
    it('calls reconcile with an empty rules array', async () => {
      const gherkinDoc = makeGherkinDoc();
      const runId = createReconcilingRun(gherkinDoc);

      reconciliationService.reconcile.mockResolvedValue(makeGherkinDoc());

      await orchestrator.executeReconcile(runId);

      expect(reconciliationService.reconcile).toHaveBeenCalledWith(gherkinDoc, []);
    });
  });

  // ── Failure path ───────────────────────────────────────────────────────────

  describe('failure path — reconciliation service throws', () => {
    let runId: string;
    let collectedEvents: RunStreamEvent[];

    beforeEach(async () => {
      collectedEvents = [];
      runId = createReconcilingRun(makeGherkinDoc(), makeBusinessRules());

      reconciliationService.reconcile.mockRejectedValue(new Error('LLM quota exceeded'));

      runsEvents.stream(runId).subscribe((e) => collectedEvents.push(e));

      await orchestrator.executeReconcile(runId);
    });

    it('transitions run to failed', () => {
      expect(runsService.getRun(runId).status).toBe(RunStatus.Failed);
    });

    it('does not store a unified doc on a failed run', () => {
      expect(runsService.getRun(runId).unifiedDoc).toBeUndefined();
    });

    it('emits error event before terminal transition', () => {
      const errorIdx = collectedEvents.findIndex(
        (e) => 'type' in e && (e as { type: string }).type === 'error'
      );
      const failedIdx = collectedEvents.findIndex(
        (e) => 'to' in e && (e as { to: RunStatus }).to === RunStatus.Failed
      );
      expect(errorIdx).toBeGreaterThanOrEqual(0);
      expect(failedIdx).toBeGreaterThan(errorIdx);
    });

    it('error event includes failure message', () => {
      const errorEvent = collectedEvents.find(
        (e) => 'type' in e && (e as { type: string }).type === 'error'
      ) as { message: string } | undefined;
      expect(errorEvent?.message).toContain('LLM quota exceeded');
    });

    it('emits reconciling→failed transition', () => {
      const transition = collectedEvents.find(
        (e) => 'to' in e && (e as { to: RunStatus }).to === RunStatus.Failed
      );
      expect((transition as { from: RunStatus } | undefined)?.from).toBe(RunStatus.Reconciling);
    });
  });

  // ── Missing GherkinDoc ─────────────────────────────────────────────────────

  describe('failure path — no gherkin doc on run', () => {
    it('transitions to failed and emits an error event', async () => {
      const runId = createReconcilingRun(); // no gherkinDoc stored
      const collectedEvents: RunStreamEvent[] = [];
      runsEvents.stream(runId).subscribe((e) => collectedEvents.push(e));

      await orchestrator.executeReconcile(runId);

      expect(runsService.getRun(runId).status).toBe(RunStatus.Failed);

      const errorEvent = collectedEvents.find(
        (e) => 'type' in e && (e as { type: string }).type === 'error'
      ) as { message: string } | undefined;
      expect(errorEvent?.message).toContain('No Gherkin document');
      expect(reconciliationService.reconcile).not.toHaveBeenCalled();
    });
  });

  // ── Guard: wrong starting state ────────────────────────────────────────────

  describe('when run is not in reconciling state', () => {
    it('throws IllegalRunTransitionError without emitting any events', async () => {
      const run = runsService.createRun(RUN_REQUEST);
      const collectedEvents: RunStreamEvent[] = [];
      runsEvents.stream(run.runId).subscribe((e) => collectedEvents.push(e));

      await expect(orchestrator.executeReconcile(run.runId)).rejects.toThrow(
        IllegalRunTransitionError
      );

      expect(collectedEvents).toHaveLength(0);
      expect(reconciliationService.reconcile).not.toHaveBeenCalled();
    });

    it('throws when run is in review state (already past reconciling)', async () => {
      const runId = createReconcilingRun(makeGherkinDoc(), makeBusinessRules());
      runsService.transitionRun(runId, RunStatus.Review);

      await expect(orchestrator.executeReconcile(runId)).rejects.toThrow(IllegalRunTransitionError);
    });
  });
});
