import { BusinessRule, RunStatus } from '@baia/shared';
import { Logger } from '@nestjs/common';

import { IllegalRunTransitionError } from '../runs/run-state-machine';
import { RunsEventsService, RunStreamEvent } from '../runs/runs.events';
import { RunStateMachine } from '../runs/run-state-machine';
import { RunsService } from '../runs/runs.service';
import { CredentialStoreService } from '../security';
import { OutputWriterService } from '../output/output-writer.service';

import { AnalyzeOrchestrator } from './analyze.orchestrator';
import { AzureConnector } from './azure-connector';
import { GitHubConnector } from './github-connector';
import { IngestionService, IngestedRepo } from './ingestion.service';
import { RepoConnector } from './repo-connector';
import { RuleExtractorService } from './rule-extractor.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIngestedRepo(fileCount = 2, chunksPerFile = 1): IngestedRepo {
  return {
    files: Array.from({ length: fileCount }, (_, i) => ({
      path: `src/file${i}.ts`,
      chunks: Array.from({ length: chunksPerFile }, (_, j) => ({
        text: `// file ${i} chunk ${j}`,
        tokenCount: 10,
      })),
    })),
    totalChunks: fileCount * chunksPerFile,
    skippedFiles: [],
  };
}

function makeBusinessRules(count = 2): BusinessRule[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `src/file${i}.ts::rule-${i}`,
    description: `Rule ${i}`,
    category: 'validation',
    sourceRef: `src/file${i}.ts:chunk0`,
  }));
}

const RUN_REQUEST = {
  targetUrl: 'https://example.com',
  instructions: 'Click the button',
  repoUrl: 'https://github.com/org/repo',
  repoProvider: 'github' as const,
  credentialsRef: 'creds-ref-1',
};

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function makeMockConnector(): jest.Mocked<RepoConnector> {
  return {
    auth: jest.fn().mockResolvedValue(undefined),
    listTree: jest.fn().mockResolvedValue([]),
    readFile: jest.fn().mockResolvedValue(''),
    clone: jest.fn().mockResolvedValue({ files: new Map() }),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('AnalyzeOrchestrator', () => {
  let orchestrator: AnalyzeOrchestrator;
  let runsService: RunsService;
  let runsEvents: RunsEventsService;
  let githubConnector: jest.Mocked<GitHubConnector>;
  let azureConnector: jest.Mocked<AzureConnector>;
  let ingestionService: jest.Mocked<Pick<IngestionService, 'ingestWithConnector'>>;
  let ruleExtractor: jest.Mocked<Pick<RuleExtractorService, 'extractRules'>>;
  let credentialStore: jest.Mocked<Pick<CredentialStoreService, 'retrieve'>>;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    const mockOutputWriter = {
      initRun: jest.fn(),
      updateRunSummary: jest.fn(),
      appendEvent: jest.fn(),
      saveBusinessRules: jest.fn(),
    } as unknown as OutputWriterService;

    runsEvents = new RunsEventsService(mockOutputWriter);
    const stateMachine = new RunStateMachine();
    stateMachine.onTransition(e => runsEvents.emit(e.runId, e));
    runsService = new RunsService(stateMachine, mockOutputWriter);

    githubConnector = makeMockConnector() as unknown as jest.Mocked<GitHubConnector>;
    azureConnector = makeMockConnector() as unknown as jest.Mocked<AzureConnector>;

    ingestionService = {
      ingestWithConnector: jest.fn(),
    };

    ruleExtractor = {
      extractRules: jest.fn(),
    };

    credentialStore = {
      retrieve: jest.fn().mockReturnValue('fake-token'),
    };

    orchestrator = new AnalyzeOrchestrator(
      runsService,
      runsEvents,
      githubConnector as unknown as GitHubConnector,
      azureConnector as unknown as AzureConnector,
      ingestionService as unknown as IngestionService,
      ruleExtractor as unknown as RuleExtractorService,
      credentialStore as unknown as CredentialStoreService,
      mockOutputWriter
    );
  });

  /** Helper: create a run and advance it to `analyzing` state. */
  function createAnalyzingRun(): string {
    const run = runsService.createRun(RUN_REQUEST);
    runsService.transitionRun(run.runId, RunStatus.Exploring);
    runsService.transitionRun(run.runId, RunStatus.Analyzing);
    return run.runId;
  }

  // ── Happy path ─────────────────────────────────────────────────────────────

  describe('happy path (github provider)', () => {
    let runId: string;
    let collectedEvents: RunStreamEvent[];
    const ingestedRepo = makeIngestedRepo(3, 2);
    const businessRules = makeBusinessRules(4);

    beforeEach(async () => {
      collectedEvents = [];
      runId = createAnalyzingRun();

      ingestionService.ingestWithConnector.mockResolvedValue(ingestedRepo);
      ruleExtractor.extractRules.mockResolvedValue(businessRules);

      runsEvents.stream(runId).subscribe((e) => collectedEvents.push(e));

      await orchestrator.executePhase2(
        runId,
        RUN_REQUEST.repoUrl,
        'github',
        RUN_REQUEST.credentialsRef
      );
    });

    it('transitions run to reconciling', () => {
      expect(runsService.getRun(runId).status).toBe(RunStatus.Reconciling);
    });

    it('stores business rules on the run', () => {
      expect(runsService.getRun(runId).businessRules).toEqual(businessRules);
    });

    it('retrieves credentials from the store', () => {
      expect(credentialStore.retrieve).toHaveBeenCalledWith(RUN_REQUEST.credentialsRef);
    });

    it('auths the github connector with token and repoUrl', () => {
      expect(githubConnector.auth).toHaveBeenCalledWith({
        token: 'fake-token',
        repoUrl: RUN_REQUEST.repoUrl,
      });
    });

    it('does not touch the azure connector', () => {
      expect(azureConnector.auth).not.toHaveBeenCalled();
    });

    it('calls ingestWithConnector with the github connector', () => {
      expect(ingestionService.ingestWithConnector).toHaveBeenCalledWith(githubConnector);
    });

    it('calls extractRules with ingested repo', () => {
      expect(ruleExtractor.extractRules).toHaveBeenCalledWith(ingestedRepo);
    });

    it('emits analyzing→reconciling transition event', () => {
      const transition = collectedEvents.find(
        (e) => 'to' in e && (e as { to: RunStatus }).to === RunStatus.Reconciling
      );
      expect(transition).toBeDefined();
      expect((transition as { from: RunStatus }).from).toBe(RunStatus.Analyzing);
    });

    it('emits observation events for each phase step', () => {
      const observations = collectedEvents.filter(
        (e) => 'type' in e && (e as { type: string }).type === 'observation'
      );
      expect(observations.length).toBeGreaterThanOrEqual(3);
    });

    it('emits a complete event', () => {
      const complete = collectedEvents.find(
        (e) => 'type' in e && (e as { type: string }).type === 'complete'
      );
      expect(complete).toBeDefined();
    });

    it('complete event includes ruleCount', () => {
      const complete = collectedEvents.find(
        (e) => 'type' in e && (e as { type: string }).type === 'complete'
      ) as { details?: Record<string, unknown> } | undefined;
      expect(complete?.details?.['ruleCount']).toBe(businessRules.length);
    });
  });

  // ── Azure provider ─────────────────────────────────────────────────────────

  describe('azure provider selection', () => {
    it('auths the azure connector when repoProvider is azure', async () => {
      const runId = createAnalyzingRun();
      ingestionService.ingestWithConnector.mockResolvedValue(makeIngestedRepo());
      ruleExtractor.extractRules.mockResolvedValue([]);

      await orchestrator.executePhase2(
        runId,
        'https://dev.azure.com/org/proj/_git/repo',
        'azure',
        'creds-1'
      );

      expect(azureConnector.auth).toHaveBeenCalledWith({
        token: 'fake-token',
        repoUrl: 'https://dev.azure.com/org/proj/_git/repo',
      });
      expect(githubConnector.auth).not.toHaveBeenCalled();
    });
  });

  // ── Failure path ───────────────────────────────────────────────────────────

  describe('failure path', () => {
    let runId: string;
    let collectedEvents: RunStreamEvent[];

    beforeEach(async () => {
      collectedEvents = [];
      runId = createAnalyzingRun();

      ingestionService.ingestWithConnector.mockRejectedValue(new Error('Network timeout'));

      runsEvents.stream(runId).subscribe((e) => collectedEvents.push(e));

      await orchestrator.executePhase2(
        runId,
        RUN_REQUEST.repoUrl,
        'github',
        RUN_REQUEST.credentialsRef
      );
    });

    it('transitions run to failed', () => {
      expect(runsService.getRun(runId).status).toBe(RunStatus.Failed);
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
      expect(errorEvent?.message).toContain('Network timeout');
    });

    it('emits analyzing→failed transition', () => {
      const transition = collectedEvents.find(
        (e) => 'to' in e && (e as { to: RunStatus }).to === RunStatus.Failed
      );
      expect((transition as { from: RunStatus } | undefined)?.from).toBe(RunStatus.Analyzing);
    });

    it('does not store business rules on a failed run', () => {
      expect(runsService.getRun(runId).businessRules).toBeUndefined();
    });
  });

  // ── Credential retrieval failure ───────────────────────────────────────────

  describe('credential retrieval failure', () => {
    it('transitions to failed and emits error event', async () => {
      const runId = createAnalyzingRun();
      const collectedEvents: RunStreamEvent[] = [];
      runsEvents.stream(runId).subscribe((e) => collectedEvents.push(e));

      credentialStore.retrieve.mockImplementation(() => {
        throw new Error('Credential not found');
      });

      await orchestrator.executePhase2(runId, RUN_REQUEST.repoUrl, 'github', 'missing-ref');

      expect(runsService.getRun(runId).status).toBe(RunStatus.Failed);
      const errorEvent = collectedEvents.find(
        (e) => 'type' in e && (e as { type: string }).type === 'error'
      ) as { message: string } | undefined;
      expect(errorEvent?.message).toContain('Credential not found');
    });
  });

  // ── URL-only (no repo) ─────────────────────────────────────────────────────

  describe('when no repository params are provided', () => {
    it('transitions to reconciling without calling any connector', async () => {
      const runId = createAnalyzingRun();
      await orchestrator.executePhase2(runId);
      expect(runsService.getRun(runId).status).toBe(RunStatus.Reconciling);
      expect(githubConnector.auth).not.toHaveBeenCalled();
      expect(azureConnector.auth).not.toHaveBeenCalled();
      expect(ingestionService.ingestWithConnector).not.toHaveBeenCalled();
      expect(ruleExtractor.extractRules).not.toHaveBeenCalled();
    });

    it('does not store business rules when skipping analysis', async () => {
      const runId = createAnalyzingRun();
      await orchestrator.executePhase2(runId);
      expect(runsService.getRun(runId).businessRules).toBeUndefined();
    });

    it('emits a skip observation and analyzing→reconciling transition', async () => {
      const runId = createAnalyzingRun();
      const collectedEvents: RunStreamEvent[] = [];
      runsEvents.stream(runId).subscribe((e) => collectedEvents.push(e));

      await orchestrator.executePhase2(runId);

      const observation = collectedEvents.find(
        (e) => 'type' in e && (e as { type: string }).type === 'observation'
      ) as { message: string } | undefined;
      expect(observation?.message).toContain('Skipping');

      const transition = collectedEvents.find(
        (e) => 'to' in e && (e as { to: RunStatus }).to === RunStatus.Reconciling
      );
      expect(transition).toBeDefined();
    });
  });

  // ── Guard: wrong starting state ────────────────────────────────────────────

  describe('when run is not in analyzing state', () => {
    it('throws IllegalRunTransitionError without emitting any events', async () => {
      const run = runsService.createRun(RUN_REQUEST);
      const collectedEvents: RunStreamEvent[] = [];
      runsEvents.stream(run.runId).subscribe((e) => collectedEvents.push(e));

      await expect(
        orchestrator.executePhase2(
          run.runId,
          RUN_REQUEST.repoUrl,
          'github',
          RUN_REQUEST.credentialsRef
        )
      ).rejects.toThrow(IllegalRunTransitionError);

      expect(collectedEvents).toHaveLength(0);
      expect(ingestionService.ingestWithConnector).not.toHaveBeenCalled();
    });
  });

  // ── Redaction of business rules ────────────────────────────────────────────

  describe('business rule redaction', () => {
    it('redacts secret-looking values in business rule descriptions before storing', async () => {
      const runId = createAnalyzingRun();
      const fakeToken = 'ghp_1234567890abcdef1234567890abcdef12345678';

      const rulesWithSecret: BusinessRule[] = [
        {
          id: 'src/auth.ts::rule-0',
          description: `Do not log the PAT: ${fakeToken}`,
          category: 'security',
          sourceRef: 'src/auth.ts:chunk0',
        },
      ];

      ingestionService.ingestWithConnector.mockResolvedValue(makeIngestedRepo(1));
      ruleExtractor.extractRules.mockResolvedValue(rulesWithSecret);

      await orchestrator.executePhase2(
        runId,
        RUN_REQUEST.repoUrl,
        'github',
        RUN_REQUEST.credentialsRef
      );

      const storedRules = runsService.getRun(runId).businessRules ?? [];
      expect(storedRules).toHaveLength(1);
      expect(storedRules[0].description).not.toContain(fakeToken);
      expect(storedRules[0].description).toContain('[REDACTED]');
    });

    it('passes redacted rules to outputWriter.saveBusinessRules', async () => {
      const runId = createAnalyzingRun();
      const fakeToken = 'ghp_1234567890abcdef1234567890abcdef12345678';

      const rulesWithSecret: BusinessRule[] = [
        {
          id: 'src/config.ts::rule-1',
          description: `Token value: ${fakeToken}`,
          category: 'configuration',
          sourceRef: 'src/config.ts:chunk0',
        },
      ];

      ingestionService.ingestWithConnector.mockResolvedValue(makeIngestedRepo(1));
      ruleExtractor.extractRules.mockResolvedValue(rulesWithSecret);

      // Grab the outputWriter mock used by the orchestrator via the runsEvents service.
      // We need to find the mock — it's stored as a local in beforeEach.
      // Re-create a spy on the instance-level mock by inspecting the call args.
      const saveBusinessRulesMock = jest.fn();
      const mockOutputWriter = {
        initRun: jest.fn(),
        updateRunSummary: jest.fn(),
        appendEvent: jest.fn(),
        saveBusinessRules: saveBusinessRulesMock,
      } as unknown as OutputWriterService;

      // Build a fresh orchestrator with a capturable output writer.
      const freshOrchestrator = new AnalyzeOrchestrator(
        runsService,
        runsEvents,
        githubConnector as unknown as GitHubConnector,
        azureConnector as unknown as AzureConnector,
        ingestionService as unknown as IngestionService,
        ruleExtractor as unknown as RuleExtractorService,
        credentialStore as unknown as CredentialStoreService,
        mockOutputWriter
      );

      await freshOrchestrator.executePhase2(
        runId,
        RUN_REQUEST.repoUrl,
        'github',
        RUN_REQUEST.credentialsRef
      );

      expect(saveBusinessRulesMock).toHaveBeenCalledTimes(1);
      const savedRules: BusinessRule[] = saveBusinessRulesMock.mock.calls[0][1] as BusinessRule[];
      expect(savedRules[0].description).not.toContain(fakeToken);
      expect(savedRules[0].description).toContain('[REDACTED]');
    });
  });
});
