import {
  BusinessRule,
  GherkinDoc,
  RunRequest,
  RunStatus,
  RunSummary,
  UnifiedDoc,
} from '@baia/shared';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { OutputWriterService } from '../output/output-writer.service';

import { RunStateMachine } from './run-state-machine';

/**
 * Field-level validation errors returned in a 400 response.
 */
export interface FieldError {
  field: string;
  message: string;
}

/**
 * Validates a raw payload against the `RunRequest` shape and accumulates
 * per-field errors.  Does NOT depend on `class-validator` or
 * `class-transformer` (neither is guaranteed to be installed).
 */
function validateRunRequest(body: unknown): FieldError[] {
  const errors: FieldError[] = [];

  if (!body || typeof body !== 'object') {
    errors.push({ field: 'body', message: 'Request body must be a JSON object.' });
    return errors;
  }

  const candidate = body as Record<string, unknown>;

  // targetUrl — required non-empty string that looks like an HTTP(S) URL
  if (typeof candidate['targetUrl'] !== 'string' || candidate['targetUrl'].trim() === '') {
    errors.push({ field: 'targetUrl', message: 'targetUrl must be a non-empty string.' });
  } else {
    const httpUrlPattern = /^https?:\/\/.+/i;
    if (!httpUrlPattern.test(candidate['targetUrl'] as string)) {
      errors.push({
        field: 'targetUrl',
        message: 'targetUrl must be a valid http or https URL.',
      });
    }
  }

  // instructions — required non-empty string
  if (typeof candidate['instructions'] !== 'string' || candidate['instructions'].trim() === '') {
    errors.push({ field: 'instructions', message: 'instructions must be a non-empty string.' });
  }

  // repoUrl — optional, but if present must be a non-empty string
  if (candidate['repoUrl'] !== undefined) {
    if (typeof candidate['repoUrl'] !== 'string' || candidate['repoUrl'].trim() === '') {
      errors.push({
        field: 'repoUrl',
        message: 'repoUrl must be a non-empty string when provided.',
      });
    }
  }

  // repoProvider — optional, but if present must be 'github' or 'azure'
  if (candidate['repoProvider'] !== undefined) {
    if (candidate['repoProvider'] !== 'github' && candidate['repoProvider'] !== 'azure') {
      errors.push({
        field: 'repoProvider',
        message: "repoProvider must be 'github' or 'azure' when provided.",
      });
    }
  }

  // credentialsRef — optional, but if present must be a non-blank string
  if (candidate['credentialsRef'] !== undefined) {
    if (
      typeof candidate['credentialsRef'] !== 'string' ||
      candidate['credentialsRef'].trim() === ''
    ) {
      errors.push({
        field: 'credentialsRef',
        message: 'credentialsRef must be a non-blank string when provided.',
      });
    }
  }

  return errors;
}

/**
 * In-memory run store.  Creates runs in the `queued` state and delegates
 * all state-machine logic to `RunStateMachine`.
 */
@Injectable()
export class RunsService {
  private readonly logger = new Logger(RunsService.name);
  private readonly runs = new Map<string, RunSummary>();
  private nextId = 1;

  constructor(
    private readonly stateMachine: RunStateMachine,
    private readonly outputWriter: OutputWriterService
  ) {}

  /**
   * Validate `body`, create a new run in `queued`, and return the summary.
   * Throws `BadRequestException` (HTTP 400) when validation fails.
   */
  createRun(body: unknown): RunSummary {
    const errors = validateRunRequest(body);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Validation failed', errors });
    }

    // Safe cast — guard confirms the shape
    const request = body as RunRequest;
    const runId = `run-${String(this.nextId++).padStart(4, '0')}`;
    const now = new Date();

    const summary: RunSummary = {
      runId,
      status: RunStatus.Queued,
      targetUrl: request.targetUrl,
      createdAt: now,
      updatedAt: now,
    };

    this.runs.set(runId, summary);
    Promise.resolve(this.outputWriter.initRun(runId, summary)).catch((err: unknown) =>
      this.logger.error(`Failed to init output for run ${runId}: ${err}`)
    );
    this.logger.log(`Run created: ${runId} | targetUrl=${request.targetUrl}`);
    return summary;
  }

  /**
   * Retrieve a run by id.
   * Throws `NotFoundException` (HTTP 404) when the id is unknown.
   */
  getRun(runId: string): RunSummary {
    const run = this.runs.get(runId);
    if (!run) {
      throw new NotFoundException(`Run '${runId}' not found.`);
    }
    return run;
  }

  /**
   * Retrieve a run by id without throwing.
   * Returns `undefined` when the id is unknown, instead of `NotFoundException`.
   */
  tryGetRun(runId: string): RunSummary | undefined {
    return this.runs.get(runId);
  }

  /**
   * Return all runs (insertion order).
   */
  getAllRuns(): RunSummary[] {
    return Array.from(this.runs.values());
  }

  /**
   * Advance the state of a run via the state machine.
   * Intended for use by phase-wiring tasks (DEV_TASK_20/25/28/31).
   *
   * Throws `NotFoundException` for unknown ids; rethrows
   * `IllegalRunTransitionError` from the machine for invalid transitions.
   */
  transitionRun(runId: string, to: RunStatus): RunSummary {
    const run = this.getRun(runId);
    this.stateMachine.transition(runId, run.status, to);
    const updated: RunSummary = { ...run, status: to, updatedAt: new Date() };
    this.runs.set(runId, updated);
    Promise.resolve(
      this.outputWriter.updateRunSummary(runId, { status: to, updatedAt: updated.updatedAt })
    ).catch((err: unknown) =>
      this.logger.error(`Failed to update run summary for ${runId}: ${err}`)
    );
    this.logger.log(`Run ${runId}: ${run.status} → ${to}`);
    return updated;
  }

  /**
   * Attach a generated `GherkinDoc` to an existing run.
   * Throws `NotFoundException` for unknown ids.
   */
  storeGherkinDoc(runId: string, doc: GherkinDoc): RunSummary {
    const run = this.getRun(runId);
    const updated: RunSummary = { ...run, gherkinDoc: doc, updatedAt: new Date() };
    this.runs.set(runId, updated);
    this.logger.log(`Run ${runId}: GherkinDoc stored (${doc.features.length} feature(s))`);
    return updated;
  }

  /**
   * Attach extracted `BusinessRule[]` to an existing run.
   * Throws `NotFoundException` for unknown ids.
   */
  storeBusinessRules(runId: string, rules: BusinessRule[]): RunSummary {
    const run = this.getRun(runId);
    const updated: RunSummary = { ...run, businessRules: rules, updatedAt: new Date() };
    this.runs.set(runId, updated);
    this.logger.log(`Run ${runId}: ${rules.length} business rule(s) stored`);
    return updated;
  }

  /**
   * Attach a reconciled `UnifiedDoc` to an existing run.
   * Throws `NotFoundException` for unknown ids.
   */
  storeUnifiedDoc(runId: string, doc: UnifiedDoc): RunSummary {
    const run = this.getRun(runId);
    const updated: RunSummary = { ...run, unifiedDoc: doc, updatedAt: new Date() };
    this.runs.set(runId, updated);
    const scenarioCount = doc.features.reduce((n, f) => n + f.scenarios.length, 0);
    this.logger.log(
      `Run ${runId}: UnifiedDoc stored (${doc.features.length} feature(s), ${scenarioCount} scenario(s), ${doc.conflicts.length} conflict(s))`
    );
    return updated;
  }

  /** Expose the guard for testing — internal use only. */
  static validateRunRequest(body: unknown): FieldError[] {
    return validateRunRequest(body);
  }
}
