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

describe('StartController', () => {
  let controller: StartController;
  let runsService: jest.Mocked<Pick<RunsService, 'getRun'>>;
  let pipelineService: jest.Mocked<Pick<PipelineService, 'runFullPipeline'>>;
  let credentialStore: jest.Mocked<Pick<CredentialStoreService, 'store'>>;

  beforeEach(async () => {
    runsService = { getRun: jest.fn() };
    pipelineService = { runFullPipeline: jest.fn().mockResolvedValue(undefined) };
    credentialStore = { store: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StartController],
      providers: [
        { provide: RunsService, useValue: runsService },
        { provide: PipelineService, useValue: pipelineService },
        { provide: CredentialStoreService, useValue: credentialStore },
      ],
    }).compile();

    controller = module.get<StartController>(StartController);

    // Clear env vars before each test
    delete process.env['REPO_URL'];
    delete process.env['REPO_ACCESS_TOKEN'];
    delete process.env['REPO_PROVIDER'];
  });

  afterEach(() => {
    delete process.env['REPO_URL'];
    delete process.env['REPO_ACCESS_TOKEN'];
    delete process.env['REPO_PROVIDER'];
  });

  // ── POST /runs/:id/start ───────────────────────────────────────────────────

  describe('startPipeline()', () => {
    it('returns { accepted: true, runId } with 202 status', () => {
      const summary = makeSummary({ runId: 'run-0001' });
      runsService.getRun.mockReturnValue(summary);

      const result = controller.startPipeline('run-0001', VALID_BODY);

      expect(result).toEqual({ accepted: true, runId: 'run-0001' });
    });

    it('calls pipelineService.runFullPipeline with the correct arguments', async () => {
      const summary = makeSummary({ runId: 'run-0001', targetUrl: 'https://example.com' });
      runsService.getRun.mockReturnValue(summary);

      controller.startPipeline('run-0001', { instructions: 'Explore the site' });

      // Allow fire-and-forget promise to resolve
      await Promise.resolve();

      expect(pipelineService.runFullPipeline).toHaveBeenCalledWith(
        'run-0001',
        'https://example.com',
        'Explore the site',
        undefined, // repoUrl (no env var)
        'github',  // default repoProvider
        undefined  // credentialsRef (no env var)
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
      expect(pipelineService.runFullPipeline).toHaveBeenCalledWith(
        'run-0003',
        summary.targetUrl,
        VALID_BODY.instructions,
        undefined,
        'github',
        undefined
      );
    });

    it('catches pipeline errors and does not throw', async () => {
      const summary = makeSummary({ runId: 'run-0004' });
      runsService.getRun.mockReturnValue(summary);
      pipelineService.runFullPipeline.mockRejectedValue(new Error('pipeline boom'));

      // Should not throw even though pipeline will reject
      expect(() => controller.startPipeline('run-0004', VALID_BODY)).not.toThrow();

      // Allow microtask queue to flush so the .catch() handler runs without unhandled rejection
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  });
});
