import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import {
  CopilotApiError,
  CopilotClient,
  CopilotMessage,
  CopilotRequestOptions,
  COPILOT_CLIENT,
} from './copilot-client.port';
import {
  JsonSchema,
  LlmCompletionOptions,
  LlmError,
  LlmService,
  validateJsonSchema,
} from './llm.service';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Runtime configuration for {@link CopilotLlmAdapter}, sourced exclusively
 * from environment variables with `COPILOT_` prefix.
 *
 * All fields are validated in the constructor; a missing required field throws
 * an `LlmError` with code `INVALID_INPUT` at startup.
 */
export interface CopilotAdapterConfig {
  /** GitHub token with Copilot access (`COPILOT_TOKEN`). Absent in BYOK mode. */
  readonly token?: string;
  /** Model identifier to request (`COPILOT_MODEL`, default `gpt-4o`). */
  readonly model: string;
  /** Maximum retries for retriable errors (`COPILOT_MAX_RETRIES`, default 3). */
  readonly maxRetries: number;
  /** Initial back-off delay in ms (`COPILOT_RETRY_DELAY_MS`, default 500). */
  readonly retryDelayMs: number;
}

/** Approximate characters-per-token ratio used by {@link CopilotLlmAdapter.countTokens}. */
const CHARS_PER_TOKEN = 4;

// ---------------------------------------------------------------------------
// HTTP status → LlmErrorCode helpers
// ---------------------------------------------------------------------------

/** HTTP status codes the adapter will retry (server errors + gateway errors). */
const RETRIABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * Return `true` when an error thrown by the SDK is safe to retry (transient
 * network / server errors or rate-limiting).
 */
function isRetriable(err: unknown): boolean {
  const apiErr = err as Partial<CopilotApiError>;
  if (typeof apiErr?.status === 'number') {
    return RETRIABLE_STATUSES.has(apiErr.status);
  }
  // Network-level errors (no `status`) are treated as transient.
  return true;
}

/**
 * Map a raw SDK/network error to an {@link LlmError} with the appropriate
 * {@link LlmErrorCode}.
 */
function mapToLlmError(err: unknown, attemptMessage?: string): LlmError {
  const apiErr = err as Partial<CopilotApiError>;
  const msg = apiErr?.message ?? String(err);

  if (typeof apiErr?.status === 'number') {
    if (apiErr.status === 429) {
      return new LlmError('RATE_LIMITED', `Copilot rate-limited: ${msg}`, undefined, err);
    }
    if (apiErr.status === 401 || apiErr.status === 403) {
      return new LlmError(
        'PROVIDER_ERROR',
        `Copilot auth error (${apiErr.status}): ${msg}`,
        undefined,
        err
      );
    }
    if (apiErr.status === 408) {
      return new LlmError('TIMEOUT', `Copilot request timed out: ${msg}`, undefined, err);
    }
  }

  // Code-based detection for content filters.
  if (
    typeof apiErr?.code === 'string' &&
    (apiErr.code === 'content_filter' || apiErr.code.includes('filter'))
  ) {
    return new LlmError('CONTENT_FILTERED', `Copilot content filtered: ${msg}`, undefined, err);
  }

  const prefix = attemptMessage ? `${attemptMessage}: ` : '';
  return new LlmError('PROVIDER_ERROR', `${prefix}${msg}`, undefined, err);
}

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

/**
 * Execute `fn` up to `maxAttempts` times, doubling the delay between retries
 * (exponential back-off with jitter). Only retries when {@link isRetriable}
 * returns `true` for the thrown error.
 *
 * @throws The last error (mapped to {@link LlmError}) when all attempts fail.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number,
  baseDelayMs: number,
  logger: Logger,
  label: string
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLast = attempt === maxAttempts;
      if (isLast || !isRetriable(err)) {
        break;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(
        `${label}: attempt ${attempt}/${maxAttempts} failed — retrying in ${delay}ms`,
        (err as Partial<CopilotApiError>)?.message ?? String(err)
      );
      await sleep(delay);
    }
  }
  throw mapToLlmError(lastError, `${label} failed after ${maxAttempts} attempt(s)`);
}

/** Tiny promisified delay — extracted so tests can mock `Date`/timers if needed. */
function sleep(ms: number): Promise<void> {
  // Use the Node.js-scoped timer reference to satisfy ESLint's no-undef rule
  // (the ESLint globals list does not enumerate browser/Node timer globals).
  return new Promise<void>((resolve) => {
    const fn = (globalThis as unknown as { setTimeout: (cb: () => void, ms: number) => void })
      .setTimeout;
    fn(resolve, ms);
  });
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

/**
 * `LlmService` implementation backed by the GitHub Copilot API.
 *
 * ## Seam
 * All Copilot SDK calls are made through the injected {@link CopilotClient}
 * port — {@link COPILOT_CLIENT} is the **single seam** where the real Copilot
 * SDK package is wired in production. This adapter never imports any SDK
 * directly, which keeps it fully unit-testable via a mock client.
 *
 * ## Configuration
 * Read at construction time from `process.env` using `COPILOT_*` variables:
 * - `COPILOT_TOKEN` (required) — GitHub PAT or Copilot token.
 * - `COPILOT_MODEL`            — model id (default: `gpt-4o`).
 * - `COPILOT_MAX_RETRIES`      — retry attempts (default: 3).
 * - `COPILOT_RETRY_DELAY_MS`   — initial back-off delay ms (default: 500).
 *
 * ## Error contract
 * All methods reject with {@link LlmError}; no raw SDK errors escape.
 */
@Injectable()
export class CopilotLlmAdapter implements LlmService {
  private readonly logger = new Logger(CopilotLlmAdapter.name);
  private readonly config: CopilotAdapterConfig;

  constructor(
    /**
     * The injectable Copilot client port.
     *
     * In production bind {@link COPILOT_CLIENT} to a thin wrapper around the
     * real GitHub Copilot SDK. In tests inject a mock that satisfies
     * {@link CopilotClient}.
     */
    @Inject(COPILOT_CLIENT) private readonly client: CopilotClient,
    /**
     * Optional pre-built config (useful for testing). When omitted the adapter
     * reads from `process.env`.
     */
    @Optional() config?: CopilotAdapterConfig
  ) {
    this.config = config ?? CopilotLlmAdapter.loadConfig();
  }

  // --------------------------------------------------------------------------
  // LlmService implementation
  // --------------------------------------------------------------------------

  async complete(prompt: string, opts?: LlmCompletionOptions): Promise<string> {
    this.assertPrompt(prompt);
    const messages = this.buildMessages(prompt, opts);
    const reqOpts = this.buildRequestOptions(opts);

    const completion = await withRetry(
      () => this.client.complete(messages, reqOpts),
      this.config.maxRetries,
      this.config.retryDelayMs,
      this.logger,
      'CopilotLlmAdapter.complete'
    );

    if (completion.finishReason === 'content_filter') {
      throw new LlmError('CONTENT_FILTERED', 'Copilot response was content-filtered');
    }

    const text = completion.text;
    if (typeof text !== 'string') {
      throw new LlmError(
        'PROVIDER_ERROR',
        `Malformed response: expected string text, got ${typeof text}`,
        { finishReason: completion.finishReason }
      );
    }

    return text;
  }

  async completeJson<T>(
    prompt: string,
    schema: JsonSchema,
    opts?: LlmCompletionOptions
  ): Promise<T> {
    this.assertPrompt(prompt);
    if (schema === undefined || schema === null) {
      throw new LlmError('INVALID_INPUT', 'A JSON schema is required for completeJson');
    }

    // Instruct the model to output JSON.
    const jsonPrompt = `${prompt}\n\nRespond with valid JSON only — no markdown, no prose, no code fences.`;
    const raw = await this.complete(jsonPrompt, opts);

    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      throw new LlmError(
        'SCHEMA_VALIDATION',
        `Copilot response is not valid JSON: ${(e as Error).message}`,
        { output: raw },
        e
      );
    }

    const validationError = validateJsonSchema(parsed, schema);
    if (validationError) {
      throw new LlmError(
        'SCHEMA_VALIDATION',
        `Copilot JSON output failed schema validation: ${validationError}`,
        { output: parsed, path: validationError }
      );
    }

    return parsed as T;
  }

  countTokens(text: string): number {
    if (text.length === 0) {
      return 0;
    }
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  async *stream(prompt: string, opts?: LlmCompletionOptions): AsyncIterable<string> {
    this.assertPrompt(prompt);
    const messages = this.buildMessages(prompt, opts);
    const reqOpts = this.buildRequestOptions(opts);

    try {
      // Streaming does not retry mid-stream (partial output is not safe to
      // replay). We do a single attempt; callers may retry at a higher level.
      yield* this.client.stream(messages, reqOpts);
    } catch (err) {
      throw mapToLlmError(err, 'CopilotLlmAdapter.stream');
    }
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /** Reject empty/whitespace prompts with `INVALID_INPUT`. */
  private assertPrompt(prompt: string): void {
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new LlmError('INVALID_INPUT', 'Prompt must be a non-empty string');
    }
  }

  /** Build the ordered message array the Copilot API expects. */
  private buildMessages(prompt: string, opts?: LlmCompletionOptions): readonly CopilotMessage[] {
    const messages: CopilotMessage[] = [];
    if (opts?.system) {
      messages.push({ role: 'system', content: opts.system });
    }
    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  /** Translate {@link LlmCompletionOptions} to {@link CopilotRequestOptions}. */
  private buildRequestOptions(opts?: LlmCompletionOptions): CopilotRequestOptions {
    return {
      temperature: opts?.temperature,
      maxTokens: opts?.maxTokens,
      stop: opts?.stop,
      timeoutMs: opts?.timeoutMs,
    };
  }

  // --------------------------------------------------------------------------
  // Static config loader
  // --------------------------------------------------------------------------

  /**
   * Read and validate configuration from environment variables.
   *
   * @throws {LlmError} `INVALID_INPUT` when a required variable is absent.
   */
  static loadConfig(): CopilotAdapterConfig {
    const token = process.env['COPILOT_TOKEN'];
    if (!token || token.trim().length === 0) {
      throw new LlmError('INVALID_INPUT', 'Missing required environment variable: COPILOT_TOKEN');
    }

    const model = process.env['COPILOT_MODEL'] ?? 'gpt-4o';

    const maxRetriesRaw = process.env['COPILOT_MAX_RETRIES'];
    const maxRetries = maxRetriesRaw !== undefined ? parseInt(maxRetriesRaw, 10) : 3;
    if (Number.isNaN(maxRetries) || maxRetries < 1) {
      throw new LlmError(
        'INVALID_INPUT',
        `Invalid COPILOT_MAX_RETRIES: "${maxRetriesRaw}" — must be a positive integer`
      );
    }

    const retryDelayRaw = process.env['COPILOT_RETRY_DELAY_MS'];
    const retryDelayMs = retryDelayRaw !== undefined ? parseInt(retryDelayRaw, 10) : 500;
    if (Number.isNaN(retryDelayMs) || retryDelayMs < 0) {
      throw new LlmError(
        'INVALID_INPUT',
        `Invalid COPILOT_RETRY_DELAY_MS: "${retryDelayRaw}" — must be a non-negative integer`
      );
    }

    return { token, model, maxRetries, retryDelayMs };
  }
}
