import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';

import {
  JsonSchema,
  LlmCompletionOptions,
  LlmError,
  LlmService,
  validateJsonSchema,
} from './llm.service';

const DEFAULT_MODEL = 'claude-opus-4-8';
const DEFAULT_MAX_TOKENS = 16000;
const CHARS_PER_TOKEN = 4;

function mapToLlmError(err: unknown, context?: string): LlmError {
  const prefix = context ? `${context}: ` : '';
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new LlmError('PROVIDER_ERROR', `${prefix}Claude auth error: ${(err as Error).message}`, undefined, err);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LlmError('RATE_LIMITED', `${prefix}Claude rate-limited: ${(err as Error).message}`, undefined, err);
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new LlmError('TIMEOUT', `${prefix}Claude request timed out: ${(err as Error).message}`, undefined, err);
  }
  if (err instanceof Anthropic.APIError) {
    return new LlmError(
      'PROVIDER_ERROR',
      `${prefix}Claude API error (${err.status}): ${err.message}`,
      undefined,
      err
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  return new LlmError('PROVIDER_ERROR', `${prefix}${msg}`, undefined, err);
}

function buildParams(
  prompt: string,
  model: string,
  opts?: LlmCompletionOptions
): Anthropic.Messages.MessageCreateParams {
  return {
    model,
    max_tokens: opts?.maxTokens ?? DEFAULT_MAX_TOKENS,
    thinking: { type: 'adaptive' },
    ...(opts?.system && { system: opts.system }),
    ...(opts?.stop?.length && { stop_sequences: [...opts.stop] }),
    messages: [{ role: 'user', content: prompt }],
  };
}

/**
 * LlmService implementation backed by the Anthropic Claude API.
 *
 * Configured via:
 * - `ANTHROPIC_API_KEY` (required)
 * - `ANTHROPIC_MODEL`   (default: claude-opus-4-8)
 *
 * Uses adaptive thinking on every call for highest quality output.
 */
@Injectable()
export class ClaudeLlmAdapter implements LlmService {
  private readonly logger = new Logger(ClaudeLlmAdapter.name);
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model = DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.logger.log(`Claude LLM adapter initialised — model: ${this.model}`);
  }

  async complete(prompt: string, opts?: LlmCompletionOptions): Promise<string> {
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new LlmError('INVALID_INPUT', 'Prompt must be a non-empty string');
    }

    try {
      const requestOpts = opts?.timeoutMs ? { timeout: opts.timeoutMs } : undefined;
      const stream = this.client.messages.stream(buildParams(prompt, this.model, opts), requestOpts);
      const response = await stream.finalMessage();

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new LlmError('PROVIDER_ERROR', 'Claude returned no text content');
      }

      return textBlock.text;
    } catch (err) {
      if (err instanceof LlmError) throw err;
      throw mapToLlmError(err, 'ClaudeLlmAdapter.complete');
    }
  }

  async completeJson<T>(prompt: string, schema: JsonSchema, opts?: LlmCompletionOptions): Promise<T> {
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new LlmError('INVALID_INPUT', 'Prompt must be a non-empty string');
    }
    if (schema === undefined || schema === null) {
      throw new LlmError('INVALID_INPUT', 'A JSON schema is required for completeJson');
    }

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
        `Claude response is not valid JSON: ${(e as Error).message}`,
        { output: raw },
        e
      );
    }

    const validationError = validateJsonSchema(parsed, schema);
    if (validationError) {
      throw new LlmError(
        'SCHEMA_VALIDATION',
        `Claude JSON output failed schema validation: ${validationError}`,
        { output: parsed, path: validationError }
      );
    }

    return parsed as T;
  }

  countTokens(text: string): number {
    if (text.length === 0) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  async *stream(prompt: string, opts?: LlmCompletionOptions): AsyncIterable<string> {
    if (typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new LlmError('INVALID_INPUT', 'Prompt must be a non-empty string');
    }

    try {
      const requestOpts = opts?.timeoutMs ? { timeout: opts.timeoutMs } : undefined;
      const sdkStream = this.client.messages.stream(buildParams(prompt, this.model, opts), requestOpts);

      for await (const event of sdkStream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    } catch (err) {
      if (err instanceof LlmError) throw err;
      throw mapToLlmError(err, 'ClaudeLlmAdapter.stream');
    }
  }
}
