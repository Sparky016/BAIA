import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RunStatus, RunSummary } from '@baia/shared';

import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';

/** A valid RunRequest body. */
const VALID_BODY = {
  targetUrl: 'https://example.com',
  instructions: 'Explore the homepage',
  repoUrl: 'https://github.com/org/repo',
  repoProvider: 'github' as const,
  credentialsRef: 'cred-001',
};

/** Factory for a minimal RunSummary (fills optional fields with defaults). */
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

describe('RunsController', () => {
  let controller: RunsController;
  let runsService: jest.Mocked<RunsService>;

  beforeEach(async () => {
    const mockService: jest.Mocked<Partial<RunsService>> = {
      createRun: jest.fn(),
      getRun: jest.fn(),
      getAllRuns: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RunsController],
      providers: [{ provide: RunsService, useValue: mockService }],
    }).compile();

    controller = module.get<RunsController>(RunsController);
    runsService = module.get(RunsService);
  });

  // ── POST /runs ─────────────────────────────────────────────────────────────

  describe('createRun()', () => {
    it('delegates to RunsService.createRun and returns its result', () => {
      const summary = makeSummary();
      runsService.createRun.mockReturnValue(summary);

      const result = controller.createRun(VALID_BODY);

      expect(runsService.createRun).toHaveBeenCalledWith(VALID_BODY);
      expect(result).toEqual(summary);
    });

    it('re-throws BadRequestException from the service (400)', () => {
      runsService.createRun.mockImplementation(() => {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: [{ field: 'targetUrl', message: 'targetUrl must be a valid URL.' }],
        });
      });

      expect(() => controller.createRun({ targetUrl: 'bad' })).toThrow(BadRequestException);
    });

    it('returns run with queued status on success', () => {
      const summary = makeSummary({ status: RunStatus.Queued });
      runsService.createRun.mockReturnValue(summary);

      const result = controller.createRun(VALID_BODY);

      expect(result.status).toBe(RunStatus.Queued);
    });

    it('returns run with the correct targetUrl', () => {
      const summary = makeSummary({ targetUrl: VALID_BODY.targetUrl });
      runsService.createRun.mockReturnValue(summary);

      const result = controller.createRun(VALID_BODY);

      expect(result.targetUrl).toBe(VALID_BODY.targetUrl);
    });

    it('propagates validation error with field errors in response body', () => {
      const fieldErrors = [
        { field: 'instructions', message: 'instructions must be a non-empty string.' },
      ];
      runsService.createRun.mockImplementation(() => {
        throw new BadRequestException({ message: 'Validation failed', errors: fieldErrors });
      });

      let caught: unknown;
      try {
        controller.createRun({ ...VALID_BODY, instructions: '' });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      const response = (caught as BadRequestException).getResponse() as {
        errors: Array<{ field: string; message: string }>;
      };
      expect(response.errors).toEqual(fieldErrors);
    });
  });

  // ── GET /runs ──────────────────────────────────────────────────────────────

  describe('getAllRuns()', () => {
    it('returns an empty array when no runs exist', () => {
      runsService.getAllRuns.mockReturnValue([]);
      expect(controller.getAllRuns()).toEqual([]);
    });

    it('returns all runs provided by the service', () => {
      const summaries = [
        makeSummary({ runId: 'run-0001' }),
        makeSummary({ runId: 'run-0002', targetUrl: 'https://other.com' }),
      ];
      runsService.getAllRuns.mockReturnValue(summaries);

      const result = controller.getAllRuns();

      expect(result).toHaveLength(2);
      expect(result[0].runId).toBe('run-0001');
      expect(result[1].runId).toBe('run-0002');
    });

    it('delegates to RunsService.getAllRuns', () => {
      runsService.getAllRuns.mockReturnValue([]);
      controller.getAllRuns();
      expect(runsService.getAllRuns).toHaveBeenCalledTimes(1);
    });
  });

  // ── GET /runs/:id ──────────────────────────────────────────────────────────

  describe('getRun()', () => {
    it('returns the run summary for a known id', () => {
      const summary = makeSummary({ runId: 'run-0001' });
      runsService.getRun.mockReturnValue(summary);

      const result = controller.getRun('run-0001');

      expect(runsService.getRun).toHaveBeenCalledWith('run-0001');
      expect(result).toEqual(summary);
    });

    it('re-throws NotFoundException for an unknown id (404)', () => {
      runsService.getRun.mockImplementation(() => {
        throw new NotFoundException("Run 'run-9999' not found.");
      });

      expect(() => controller.getRun('run-9999')).toThrow(NotFoundException);
    });

    it('NotFoundException message includes the unknown id', () => {
      runsService.getRun.mockImplementation((id: string) => {
        throw new NotFoundException(`Run '${id}' not found.`);
      });

      let caught: unknown;
      try {
        controller.getRun('run-missing');
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).message).toContain('run-missing');
    });

    it('returns the full RunSummary shape', () => {
      const now = new Date();
      const summary = makeSummary({
        runId: 'run-0001',
        status: RunStatus.Exploring,
        targetUrl: 'https://example.com',
        createdAt: now,
        updatedAt: now,
      });
      runsService.getRun.mockReturnValue(summary);

      const result = controller.getRun('run-0001');

      expect(result.runId).toBe('run-0001');
      expect(result.status).toBe(RunStatus.Exploring);
      expect(result.createdAt).toEqual(now);
    });
  });
});
