import { Injectable } from '@nestjs/common';

import {
  JsonSchema,
  LlmCompletionOptions,
  LlmError,
  LlmService,
  validateJsonSchema,
} from './llm.service';

/**
 * Deterministic, dependency-free {@link LlmService} for unit tests and E2E.
 *
 * Outputs are a pure function of their inputs (no randomness, no clock, no
 * network), so assertions are stable across runs:
 *
 * - {@link complete} echoes a fixed, prompt-derived string.
 * - {@link completeJson} synthesises a value that satisfies the supplied schema
 *   and runs it through the real {@link validateJsonSchema} — so the
 *   JSON-validation path is genuinely exercised. Callers can force the failure
 *   path by setting {@link LlmCompletionOptions.system} to
 *   {@link MockLlmService.FORCE_INVALID_JSON}.
 * - {@link countTokens} uses a simple, stable word/char heuristic.
 * - {@link stream} yields the {@link complete} output split into whitespace
 *   chunks.
 *
 * It honours the same error contract as the real adapter (rejects with
 * {@link LlmError}).
 */
@Injectable()
export class MockLlmService implements LlmService {
  /**
   * Sentinel `opts.system` value that makes {@link completeJson} emit output
   * that deliberately fails schema validation — lets tests cover the
   * `SCHEMA_VALIDATION` rejection without a real provider.
   */
  static readonly FORCE_INVALID_JSON = '__force_invalid_json__';

  /** Deterministic divisor for the token heuristic (~4 chars/token). */
  private static readonly CHARS_PER_TOKEN = 4;

  // `async` so a failed `assertPrompt` surfaces as a rejected promise rather
  // than a synchronous throw (the error contract is "rejects with LlmError").
  async complete(prompt: string, opts?: LlmCompletionOptions): Promise<string> {
    this.assertPrompt(prompt);
    const prefix = opts?.system ? `[sys:${opts.system}] ` : '';
    return `${prefix}mock-completion: ${prompt}`;
  }

  async completeJson<T>(
    prompt: string,
    schema: JsonSchema,
    opts?: LlmCompletionOptions
  ): Promise<T> {
    this.assertPrompt(prompt);
    if (schema === undefined || schema === null) {
      throw new LlmError('INVALID_INPUT', 'A JSON schema is required');
    }

    // Deterministically synthesise output. The FORCE_INVALID_JSON sentinel
    // produces a value that intentionally violates the schema so the
    // validation-failure branch is testable.
    const forceInvalid = opts?.system === MockLlmService.FORCE_INVALID_JSON;
    const rawOutput = forceInvalid ? this.invalidSample(schema) : this.sampleForSchema(schema);

    const error = validateJsonSchema(rawOutput, schema);
    if (error) {
      throw new LlmError('SCHEMA_VALIDATION', `Mock output failed schema validation: ${error}`, {
        output: rawOutput,
        path: error,
      });
    }
    return rawOutput as T;
  }

  countTokens(text: string): number {
    if (text.length === 0) {
      return 0;
    }
    return Math.ceil(text.length / MockLlmService.CHARS_PER_TOKEN);
  }

  async *stream(prompt: string, opts?: LlmCompletionOptions): AsyncIterable<string> {
    const full = await this.complete(prompt, opts);
    // Preserve separators so concatenation reproduces the full completion.
    for (const chunk of full.split(/(\s+)/).filter((c) => c.length > 0)) {
      yield chunk;
    }
  }

  /** Reject empty/whitespace prompts per the `INVALID_INPUT` contract. */
  private assertPrompt(prompt: string): void {
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new LlmError('INVALID_INPUT', 'Prompt must be a non-empty string');
    }
  }

  /**
   * Build a minimal value that satisfies `schema`. Deterministic: same schema
   * always yields the same value.
   */
  private sampleForSchema(schema: JsonSchema): unknown {
    switch (schema.type) {
      case 'string':
        return schema.enum ? schema.enum[0] : 'mock';
      case 'integer':
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'array':
        return [this.sampleForSchema(schema.items)];
      case 'object': {
        const out: Record<string, unknown> = {};
        // Populate required props (and any with a defined schema) so the
        // object is valid even under strict additionalProperties.
        const keys = new Set<string>([
          ...(schema.required ?? []),
          ...Object.keys(schema.properties),
        ]);
        for (const key of keys) {
          const propSchema = schema.properties[key];
          if (propSchema) {
            out[key] = this.sampleForSchema(propSchema);
          }
        }
        return out;
      }
      default: {
        const _exhaustive: never = schema;
        return _exhaustive;
      }
    }
  }

  /**
   * Build a value that deliberately violates `schema` (wrong primitive type, or
   * an unexpected extra property for objects) to drive the validation-failure
   * path.
   */
  private invalidSample(schema: JsonSchema): unknown {
    switch (schema.type) {
      case 'string':
        return 12345; // not a string
      case 'integer':
      case 'number':
        return 'not-a-number';
      case 'boolean':
        return 'not-a-boolean';
      case 'array':
        return { notAn: 'array' };
      case 'object':
        // Valid base shape plus a forbidden extra key (strict objects reject it).
        return {
          ...(this.sampleForSchema(schema) as Record<string, unknown>),
          __unexpected__: true,
        };
      default: {
        const _exhaustive: never = schema;
        return _exhaustive;
      }
    }
  }
}
