import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RunStatus } from '@baia/shared';

import { OutputWriterService } from '../output/output-writer.service';

import { IllegalRunTransitionError, RunStateMachine } from './run-state-machine';
import { FieldError, RunsService } from './runs.service';

/** Minimal valid RunRequest body. */
const VALID_BODY = {
  targetUrl: 'https://example.com',
  instructions: 'Explore the homepage',
  repoUrl: 'https://github.com/org/repo',
  repoProvider: 'github' as const,
  credentialsRef: 'cred-001',
};

describe('RunsService', () => {
  let service: RunsService;
  let stateMachine: RunStateMachine;

  beforeEach(async () => {
    // RunStateMachine takes an optional Clock function as its first constructor
    // arg.  NestJS DI cannot resolve a plain function type, so we supply a
    // factory provider that instantiates it directly.
    const mockOutputWriter: jest.Mocked<Partial<OutputWriterService>> = {
      initRun: jest.fn(),
      updateRunSummary: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RunsService,
        {
          provide: RunStateMachine,
          useFactory: () => new RunStateMachine(),
        },
        { provide: OutputWriterService, useValue: mockOutputWriter },
      ],
    }).compile();

    service = module.get<RunsService>(RunsService);
    stateMachine = module.get<RunStateMachine>(RunStateMachine);
  });

  // ── createRun ─────────────────────────────────────────────────────────────

  describe('createRun()', () => {
    it('creates a run with status queued and returns a RunSummary', () => {
      const summary = service.createRun(VALID_BODY);

      expect(summary.status).toBe(RunStatus.Queued);
      expect(summary.targetUrl).toBe(VALID_BODY.targetUrl);
      expect(summary.runId).toBeTruthy();
      expect(summary.createdAt).toBeInstanceOf(Date);
      expect(summary.updatedAt).toBeInstanceOf(Date);
    });

    it('assigns unique, incremented ids to successive runs', () => {
      const a = service.createRun(VALID_BODY);
      const b = service.createRun(VALID_BODY);

      expect(a.runId).not.toBe(b.runId);
    });

    // --- validation failures (400) ---

    it('throws BadRequestException when body is not an object', () => {
      expect(() => service.createRun(null)).toThrow(BadRequestException);
      expect(() => service.createRun('string')).toThrow(BadRequestException);
      expect(() => service.createRun(42)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when targetUrl is missing', () => {
      const body = { ...VALID_BODY, targetUrl: undefined };
      expect(() => service.createRun(body)).toThrow(BadRequestException);
    });

    it('throws BadRequestException when targetUrl is not a valid URL', () => {
      const body = { ...VALID_BODY, targetUrl: 'not-a-url' };
      const err = catchBadRequest(() => service.createRun(body));
      expectFieldError(err, 'targetUrl');
    });

    it('throws BadRequestException when targetUrl uses a non-http(s) protocol', () => {
      const body = { ...VALID_BODY, targetUrl: 'ftp://example.com' };
      const err = catchBadRequest(() => service.createRun(body));
      expectFieldError(err, 'targetUrl');
    });

    it('throws BadRequestException when instructions is empty', () => {
      const body = { ...VALID_BODY, instructions: '' };
      const err = catchBadRequest(() => service.createRun(body));
      expectFieldError(err, 'instructions');
    });

    it('throws BadRequestException when instructions is missing', () => {
      const body = { ...VALID_BODY, instructions: undefined };
      expect(() => service.createRun(body)).toThrow(BadRequestException);
    });

    it('creates a run when only targetUrl and instructions are provided', () => {
      const body = { targetUrl: 'https://example.com', instructions: 'Explore the homepage' };
      const summary = service.createRun(body);
      expect(summary.status).toBe(RunStatus.Queued);
    });

    it('throws BadRequestException when repoUrl is provided but empty', () => {
      const body = { ...VALID_BODY, repoUrl: '' };
      const err = catchBadRequest(() => service.createRun(body));
      expectFieldError(err, 'repoUrl');
    });

    it('throws BadRequestException when repoProvider is provided but invalid', () => {
      const body = { ...VALID_BODY, repoProvider: 'gitlab' };
      const err = catchBadRequest(() => service.createRun(body));
      expectFieldError(err, 'repoProvider');
    });

    it('accepts repoProvider "azure"', () => {
      const body = { ...VALID_BODY, repoProvider: 'azure' as const };
      const summary = service.createRun(body);
      expect(summary.status).toBe(RunStatus.Queued);
    });

    it('throws BadRequestException when credentialsRef is provided but blank', () => {
      const body = { ...VALID_BODY, credentialsRef: '   ' };
      const err = catchBadRequest(() => service.createRun(body));
      expectFieldError(err, 'credentialsRef');
    });

    it('includes all failing fields in the error response', () => {
      const body = { ...VALID_BODY, targetUrl: 'bad', instructions: '' };
      const err = catchBadRequest(() => service.createRun(body));
      const errors: FieldError[] = err.getResponse()['errors'];
      const fields = errors.map((e) => e.field);
      expect(fields).toContain('targetUrl');
      expect(fields).toContain('instructions');
    });
  });

  // ── getRun ────────────────────────────────────────────────────────────────

  describe('getRun()', () => {
    it('returns the run when the id exists', () => {
      const created = service.createRun(VALID_BODY);
      const fetched = service.getRun(created.runId);
      expect(fetched).toEqual(created);
    });

    it('throws NotFoundException for an unknown id', () => {
      expect(() => service.getRun('run-9999')).toThrow(NotFoundException);
    });

    it('NotFoundException message includes the requested id', () => {
      try {
        service.getRun('run-missing');
        fail('Expected NotFoundException');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundException);
        const message = (err as NotFoundException).message;
        expect(message).toContain('run-missing');
      }
    });
  });

  // ── getAllRuns ─────────────────────────────────────────────────────────────

  describe('getAllRuns()', () => {
    it('returns an empty array when no runs have been created', () => {
      expect(service.getAllRuns()).toEqual([]);
    });

    it('returns all created runs in insertion order', () => {
      const a = service.createRun(VALID_BODY);
      const b = service.createRun({ ...VALID_BODY, targetUrl: 'https://other.com' });
      const all = service.getAllRuns();
      expect(all).toHaveLength(2);
      expect(all[0].runId).toBe(a.runId);
      expect(all[1].runId).toBe(b.runId);
    });
  });

  // ── transitionRun ─────────────────────────────────────────────────────────

  describe('transitionRun()', () => {
    it('advances the run status via the state machine', () => {
      const created = service.createRun(VALID_BODY);
      const updated = service.transitionRun(created.runId, RunStatus.Exploring);
      expect(updated.status).toBe(RunStatus.Exploring);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    it('persists the new status so subsequent getRun reflects the change', () => {
      const created = service.createRun(VALID_BODY);
      service.transitionRun(created.runId, RunStatus.Exploring);
      expect(service.getRun(created.runId).status).toBe(RunStatus.Exploring);
    });

    it('throws NotFoundException for an unknown id', () => {
      expect(() => service.transitionRun('run-9999', RunStatus.Exploring)).toThrow(
        NotFoundException
      );
    });

    it('rethrows IllegalRunTransitionError for illegal transitions', () => {
      const created = service.createRun(VALID_BODY);
      expect(() => service.transitionRun(created.runId, RunStatus.Done)).toThrow(
        IllegalRunTransitionError
      );
    });
  });

  // ── static validateRunRequest (white-box) ─────────────────────────────────

  describe('static validateRunRequest()', () => {
    it('returns no errors for a fully valid body', () => {
      expect(RunsService.validateRunRequest(VALID_BODY)).toHaveLength(0);
    });

    it('returns errors only for the required fields when body is empty', () => {
      const empty = {};
      const errors = RunsService.validateRunRequest(empty);
      const fields = errors.map((e: FieldError) => e.field);
      expect(fields).toContain('targetUrl');
      expect(fields).toContain('instructions');
      expect(fields).not.toContain('repoUrl');
      expect(fields).not.toContain('repoProvider');
      expect(fields).not.toContain('credentialsRef');
    });

    it('returns no errors when stateMachine is injected', () => {
      // Ensure the DI-injected instance is the same provider
      expect(stateMachine).toBeInstanceOf(RunStateMachine);
    });
  });
});

// ── helpers ───────────────────────────────────────────────────────────────────

function catchBadRequest(fn: () => unknown): BadRequestException {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  if (!(caught instanceof BadRequestException)) {
    throw new Error(`Expected BadRequestException but got: ${String(caught)}`);
  }
  return caught;
}

function expectFieldError(err: BadRequestException, field: string): void {
  const response = err.getResponse() as { errors?: FieldError[] };
  expect(response.errors).toBeDefined();
  const fields = (response.errors ?? []).map((e) => e.field);
  expect(fields).toContain(field);
}
