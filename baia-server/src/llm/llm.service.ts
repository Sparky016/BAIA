/**
 * Provider-agnostic LLM contract for BAIA.
 *
 * Every BAIA feature that talks to a language model depends on this interface
 * — never on a concrete SDK. This keeps the GitHub Copilot SDK (wired in
 * {@link DEV_TASK_12 `CopilotLlmAdapter`}) fully swappable and makes all
 * LLM-consuming code unit-testable via {@link MockLlmService}.
 *
 * ## Error contract
 * All methods reject with an {@link LlmError} (never a bare `Error` or a
 * provider-specific exception) so callers can branch on a stable
 * {@link LlmErrorCode} without leaking SDK details:
 *
 * - `INVALID_INPUT`    — the prompt/options/schema were malformed or empty.
 * - `SCHEMA_VALIDATION` — `completeJson` produced output that did not match the
 *                         supplied {@link JsonSchema} (includes the offending
 *                         payload + the failing path in {@link LlmError.detail}).
 * - `PROVIDER_ERROR`   — the underlying provider failed (network, auth, 5xx).
 * - `RATE_LIMITED`     — the provider throttled the request.
 * - `TIMEOUT`          — the request exceeded {@link LlmCompletionOptions.timeoutMs}.
 * - `CONTENT_FILTERED` — the provider refused/filtered the response.
 *
 * Implementations MUST translate any internal failure into one of these codes.
 */

/** Stable, provider-agnostic error codes. See the error contract above. */
export type LlmErrorCode =
  | 'INVALID_INPUT'
  | 'SCHEMA_VALIDATION'
  | 'PROVIDER_ERROR'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'CONTENT_FILTERED';

/**
 * The single error type every {@link LlmService} method rejects with.
 *
 * Carries a stable {@link LlmErrorCode} plus optional structured `detail` (e.g.
 * the raw model output and failing JSON path for `SCHEMA_VALIDATION`) and the
 * original `cause` for diagnostics/logging — without forcing callers to know
 * about any specific SDK.
 */
export class LlmError extends Error {
  constructor(
    /** Stable, branchable error category. */
    public readonly code: LlmErrorCode,
    message: string,
    /** Optional structured context (e.g. raw output, failing schema path). */
    public readonly detail?: unknown,
    /** The underlying provider/runtime error, if any. */
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'LlmError';
    // Restore the prototype chain (TS target ES2021 / extending built-ins).
    Object.setPrototypeOf(this, LlmError.prototype);
  }
}

/**
 * Options shared by every completion call.
 *
 * All fields are optional; implementations supply sensible defaults. Unknown
 * fields are intentionally disallowed (no index signature) so typos surface at
 * compile time.
 */
export interface LlmCompletionOptions {
  /** Optional system/role instruction prepended ahead of the user prompt. */
  readonly system?: string;
  /** Sampling temperature (0 = deterministic). Provider clamps out-of-range. */
  readonly temperature?: number;
  /** Hard cap on tokens generated in the response. */
  readonly maxTokens?: number;
  /** Sequences that, when generated, halt the completion. */
  readonly stop?: readonly string[];
  /** Per-request deadline; exceeding it rejects with `TIMEOUT`. */
  readonly timeoutMs?: number;
}

/**
 * Minimal, dependency-free JSON Schema subset used to validate structured
 * output from {@link LlmService.completeJson}.
 *
 * Deliberately tiny — only what BAIA's structured prompts need — so we avoid
 * adding a runtime validation dependency. The accompanying validator
 * ({@link validateJsonSchema}) enforces exactly these keywords.
 */
export type JsonSchema = StringSchema | NumberSchema | BooleanSchema | ArraySchema | ObjectSchema;

export interface StringSchema {
  readonly type: 'string';
  /** Optional closed set of allowed string values. */
  readonly enum?: readonly string[];
}

export interface NumberSchema {
  readonly type: 'number' | 'integer';
}

export interface BooleanSchema {
  readonly type: 'boolean';
}

export interface ArraySchema {
  readonly type: 'array';
  /** Schema every element must satisfy. */
  readonly items: JsonSchema;
}

export interface ObjectSchema {
  readonly type: 'object';
  /** Per-property schemas. */
  readonly properties: Readonly<Record<string, JsonSchema>>;
  /** Property names that must be present (defaults to none). */
  readonly required?: readonly string[];
  /**
   * Whether properties outside {@link ObjectSchema.properties} are allowed.
   * Defaults to `false` (strict) to catch model hallucinations.
   */
  readonly additionalProperties?: boolean;
}

/**
 * The provider-agnostic LLM service.
 *
 * Inject via the {@link LLM_SERVICE} token, never by concrete class:
 *
 * ```ts
 * constructor(@Inject(LLM_SERVICE) private readonly llm: LlmService) {}
 * ```
 */
export interface LlmService {
  /**
   * Generate a free-form text completion for `prompt`.
   *
   * @param prompt Non-empty user prompt.
   * @param opts   Optional per-request tuning.
   * @returns The model's text response (never `null`/`undefined`).
   * @throws {LlmError} `INVALID_INPUT` for an empty prompt; otherwise a
   *         provider/transport code per the error contract.
   */
  complete(prompt: string, opts?: LlmCompletionOptions): Promise<string>;

  /**
   * Generate a completion and parse + validate it against `schema`, returning a
   * strongly-typed value. Use this for any structured prompt (planners,
   * extractors, Gherkin generators) rather than parsing `complete()` by hand.
   *
   * The caller's `T` is the asserted shape; `schema` is the runtime guarantee.
   * Keep the two in sync — `schema` is the source of truth at runtime.
   *
   * @param prompt Non-empty user prompt (should instruct the model to emit JSON).
   * @param schema Runtime schema the parsed output must satisfy.
   * @param opts   Optional per-request tuning.
   * @returns The validated, typed object.
   * @throws {LlmError} `INVALID_INPUT` for an empty prompt/missing schema;
   *         `SCHEMA_VALIDATION` if the output is not valid JSON or does not
   *         match `schema` (with the raw output + failing path in `detail`);
   *         otherwise a provider/transport code.
   */
  completeJson<T>(prompt: string, schema: JsonSchema, opts?: LlmCompletionOptions): Promise<T>;

  /**
   * Estimate the token count of `text` for budgeting/chunking decisions.
   *
   * Synchronous and side-effect-free. Implementations MAY approximate; callers
   * should treat the result as an upper-bound-ish estimate, not an exact count.
   *
   * @param text Text to measure (empty string returns `0`).
   * @returns A non-negative token estimate.
   */
  countTokens(text: string): number;

  /**
   * Optional streaming variant of {@link complete}. Yields incremental text
   * chunks as they arrive; concatenating all chunks equals the full completion.
   *
   * Implementations that cannot stream MAY omit this method entirely (it is
   * optional on the interface); consumers MUST feature-detect before calling.
   *
   * @throws {LlmError} Same error contract as {@link complete}; errors surface
   *         by rejecting the async iterator.
   */
  stream?(prompt: string, opts?: LlmCompletionOptions): AsyncIterable<string>;
}

/**
 * Validate `value` against `schema`. Returns the failing JSON path (e.g.
 * `"$.items[2].name"`) on the first violation, or `null` when `value` conforms.
 *
 * Hand-rolled to avoid a runtime validation dependency (none are installed).
 * Supports the {@link JsonSchema} subset only: object/array/string/number/
 * integer/boolean, `enum`, `required`, and `additionalProperties`.
 *
 * @param value  Parsed JSON value to check.
 * @param schema Schema to validate against.
 * @param path   Internal — current JSON path accumulator (defaults to `"$"`).
 */
export function validateJsonSchema(value: unknown, schema: JsonSchema, path = '$'): string | null {
  switch (schema.type) {
    case 'string': {
      if (typeof value !== 'string') {
        return `${path}: expected string`;
      }
      if (schema.enum && !schema.enum.includes(value)) {
        return `${path}: value "${value}" not in enum`;
      }
      return null;
    }
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return `${path}: expected ${schema.type}`;
      }
      if (schema.type === 'integer' && !Number.isInteger(value)) {
        return `${path}: expected integer`;
      }
      return null;
    }
    case 'boolean': {
      return typeof value === 'boolean' ? null : `${path}: expected boolean`;
    }
    case 'array': {
      if (!Array.isArray(value)) {
        return `${path}: expected array`;
      }
      for (let i = 0; i < value.length; i++) {
        const err = validateJsonSchema(value[i], schema.items, `${path}[${i}]`);
        if (err) {
          return err;
        }
      }
      return null;
    }
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return `${path}: expected object`;
      }
      const obj = value as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (!(key in obj)) {
          return `${path}.${key}: required property missing`;
        }
      }
      const allowExtra = schema.additionalProperties ?? false;
      if (!allowExtra) {
        for (const key of Object.keys(obj)) {
          if (!(key in schema.properties)) {
            return `${path}.${key}: additional property not allowed`;
          }
        }
      }
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          const err = validateJsonSchema(obj[key], propSchema, `${path}.${key}`);
          if (err) {
            return err;
          }
        }
      }
      return null;
    }
    default: {
      // Exhaustiveness guard — unreachable for well-typed schemas.
      const _exhaustive: never = schema;
      return `${path}: unsupported schema ${JSON.stringify(_exhaustive)}`;
    }
  }
}
