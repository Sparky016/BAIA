import { Test, TestingModule } from '@nestjs/testing';
import { RunStatus, RunSummary } from '@baia/shared';

import { RunsService } from '../runs/runs.service';
import { CredentialStoreService } from '../security/credential-store.service';

import { PipelineService } from './pipeline.service';
import { StartController } from './start.controller';
import { StartPipelineBody } from './pipeline.types';

/** Factory for a minimal RunSummary. */
function makeSummary(partial: Partial<RunSummary> = {}): RunSummary {
  const now = new Date('2025-01-01T00:00:00Z');
  return {
    runId: 'run-0001',
    status: RunStatus.Queued,
    targetUrl: 'https://example.com',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

const VALID_BODY: StartPipelineBody = {
  instructions: 'Test the homepage',
};

function buildModule(
  overrides: {
    runsService?: Partial<RunsService>;
    pipelineService?: Partial<PipelineService>;
    credentialStore?: Partial<CredentialStoreService>;
  } = {}
): Promise<TestingModule> {
  const runsService = { getRun: jest.fn(), ...overrides.runsService };
  const pipelineService = {
    runFullPipeline: jest.fn().mockResolvedValue(undefined),
    ...overrides.pipelineService,
  };
  const credentialStore = { store: jest.fn(), ...overrides.credentialStore };

  return Test.createTestingModule({
    controllers: [StartController],
    providers: [
      { provide: RunsService, useValue: runsService },
      { provide: PipelineService, useValue: pipelineService },
      { provide: CredentialStoreService, useValue: credentialStore },
    ],
  }).compile();
}

// ── Production mode (E2E env var NOT set) ─────────────────────────────────────

describe('StartController — production mode', () => {
  let controller: StartController;
  let runsService: jest.Mocked<Pick<RunsService, 'getRun'>>;
  let pipelineService: jest.Mocked<Pick<PipelineService, 'runFullPipeline'>>;
  let credentialStore: jest.Mocked<Pick<CredentialStoreService, 'store'>>;

  beforeEach(async () => {
    // Ensure E2E flag is not set for production tests
    delete process.env['E2E'];
    delete process.env['REPO_URL'];
    delete process.env['REPO_ACCESS_TOKEN'];
    delete process.env['REPO_PROVIDER'];

    runsService = { getRun: jest.fn() };
    pipelineService = { runFullPipeline: jest.fn().mockResolvedValue(undefined) };
    credentialStore = { store: jest.fn() };

    const module = await Test.createTestingModule({
      controllers: [StartController],
      providers: [
        { provide: RunsService, useValue: runsService },
        { provide: PipelineService, useValue: pipelineService },
        { provide: CredentialStoreService, useValue: credentialStore },
      ],
    }).compile();

    controller = module.get<StartController>(StartController);
  });

  afterEach(() => {
    delete process.env['E2E'];
    delete process.env['REPO_URL'];
    delete process.env['REPO_ACCESS_TOKEN'];
    delete process.env['REPO_PROVIDER'];
  });

  it('returns { accepted: true, runId } with 202 status', () => {
    const summary = makeSummary({ runId: 'run-0001' });
    runsService.getRun.mockReturnValue(summary);

    const result = controller.startPipeline('run-0001', VALID_BODY);

    expect(result).toEqual({ accepted: true, runId: 'run-0001' });
  });

  it('calls pipelineService.runFullPipeline with env-sourced arguments', async () => {
    const summary = makeSummary({ runId: 'run-0001', targetUrl: 'https://example.com' });
    runsService.getRun.mockReturnValue(summary);

    controller.startPipeline('run-0001', { instructions: 'Explore the site' });

    await Promise.resolve();

    expect(pipelineService.runFullPipeline).toHaveBeenCalledWith(
      'run-0001',
      'https://example.com',
      'Explore the site',
      undefined, // repoUrl — no env var set
      'github', // default repoProvider
      undefined // credentialsRef — no env var
    );
  });

  it('stores env-repo credentials and passes credentialsRef when REPO_URL + REPO_ACCESS_TOKEN are set', async () => {
    process.env['REPO_URL'] = 'https://github.com/org/repo';
    process.env['REPO_ACCESS_TOKEN'] = 'ghp_secret';

    const summary = makeSummary({ runId: 'run-0002' });
    runsService.getRun.mockReturnValue(summary);

    controller.startPipeline('run-0002', VALID_BODY);

    await Promise.resolve();

    expect(credentialStore.store).toHaveBeenCalledWith('env-repo', 'ghp_secret');
    expect(pipelineService.runFullPipeline).toHaveBeenCalledWith(
      'run-0002',
      summary.targetUrl,
      VALID_BODY.instructions,
      'https://github.com/org/repo',
      'github',
      'env-repo'
    );
  });

  it('does NOT call credentialStore.store when env vars are absent', async () => {
    const summary = makeSummary({ runId: 'run-0003' });
    runsService.getRun.mockReturnValue(summary);

    controller.startPipeline('run-0003', VALID_BODY);

    await Promise.resolve();

    expect(credentialStore.store).not.toHaveBeenCalled();
  });

  it('catches pipeline errors and does not throw', async () => {
    const summary = makeSummary({ runId: 'run-0004' });
    runsService.getRun.mockReturnValue(summary);
    pipelineService.runFullPipeline.mockRejectedValue(new Error('pipeline boom'));

    expect(() => controller.startPipeline('run-0004', VALID_BODY)).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

// ── E2E mode (E2E=true) ───────────────────────────────────────────────────────

describe('StartController — E2E mode (E2E=true)', () => {
  let controller: StartController;
  let runsService: jest.Mocked<Pick<RunsService, 'getRun'>>;
  let pipelineService: jest.Mocked<Pick<PipelineService, 'runFullPipeline'>>;
  let credentialStore: jest.Mocked<Pick<CredentialStoreService, 'store'>>;

  beforeEach(async () => {
    process.env['E2E'] = 'true';

    runsService = { getRun: jest.fn() };
    pipelineService = { runFullPipeline: jest.fn().mockResolvedValue(undefined) };
    credentialStore = { store: jest.fn() };

    const module = await Test.createTestingModule({
      controllers: [StartController],
      providers: [
        { provide: RunsService, useValue: runsService },
        { provide: PipelineService, useValue: pipelineService },
        { provide: CredentialStoreService, useValue: credentialStore },
      ],
    }).compile();

    controller = module.get<StartController>(StartController);
  });

  afterEach(() => {
    delete process.env['E2E'];
  });

  it('returns { accepted: true, runId }', () => {
    const summary = makeSummary({ runId: 'run-0010' });
    runsService.getRun.mockReturnValue(summary);

    const result = controller.startPipeline('run-0010', VALID_BODY);

    expect(result).toEqual({ accepted: true, runId: 'run-0010' });
  });

  it('seeds credentialsRef into the credential store from the request body', async () => {
    const summary = makeSummary({ runId: 'run-0011', targetUrl: 'https://example.com' });
    runsService.getRun.mockReturnValue(summary);

    const body: StartPipelineBody = {
      instructions: 'E2E run',
      repoUrl: 'https://github.com/org/repo',
      repoProvider: 'github',
      credentialsRef: 'e2e-repo-creds',
    };

    controller.startPipeline('run-0011', body);
    await Promise.resolve();

    expect(credentialStore.store).toHaveBeenCalledWith('e2e-repo-creds', 'mock-access-token');
    expect(pipelineService.runFullPipeline).toHaveBeenCalledWith(
      'run-0011',
      'https://example.com',
      'E2E run',
      'https://github.com/org/repo',
      'github',
      'e2e-repo-creds'
    );
  });

  it('seeds confluenceCredentialsRef into the credential store from the request body', async () => {
    const summary = makeSummary({ runId: 'run-0012' });
    runsService.getRun.mockReturnValue(summary);

    const body: StartPipelineBody = {
      instructions: 'E2E run with confluence',
      confluenceCredentialsRef: 'e2e-confluence-creds',
    };

    controller.startPipeline('run-0012', body);
    await Promise.resolve();

    expect(credentialStore.store).toHaveBeenCalledWith(
      'e2e-confluence-creds',
      'mock-confluence-token'
    );
  });

  it('does not seed credentials when no refs are supplied in the body', async () => {
    const summary = makeSummary({ runId: 'run-0013' });
    runsService.getRun.mockReturnValue(summary);

    controller.startPipeline('run-0013', VALID_BODY);
    await Promise.resolve();

    expect(credentialStore.store).not.toHaveBeenCalled();
  });
});
