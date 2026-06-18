/**
 * Unit tests for {@link CopilotLlmAdapter}.
 *
 * All network calls are blocked: the {@link CopilotClient} port is replaced
 * with a typed Jest mock. No live API credentials are required.
 */

import { Logger } from '@nestjs/common';

import { CopilotClient, CopilotCompletion } from './copilot-client.port';
import { CopilotAdapterConfig, CopilotLlmAdapter } from './copilot-llm.adapter';
import { JsonSchema, LlmError, ObjectSchema } from './llm.service';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/** Build a minimal {@link CopilotAdapterConfig} for tests (no env vars needed). */
function testConfig(overrides?: Partial<CopilotAdapterConfig>): CopilotAdapterConfig {
  return {
    token: 'test-token',
    model: 'gpt-4o',
    maxRetries: 3,
    retryDelayMs: 0, // eliminate real sleeps in tests
    ...overrides,
  };
}

/** Minimal mock implementing the {@link CopilotClient} interface. */
function makeMockClient(): jest.Mocked<CopilotClient> {
  return {
    complete: jest.fn<
      Promise<CopilotCompletion>,
      [readonly { role: string; content: string }[], unknown?]
    >(),
    stream: jest.fn<
      AsyncIterable<string>,
      [readonly { role: string; content: string }[], unknown?]
    >(),
  };
}

/** Utility: build adapter with the given mock client + config. */
function buildAdapter(
  client: CopilotClient,
  cfg: CopilotAdapterConfig = testConfig()
): CopilotLlmAdapter {
  return new CopilotLlmAdapter(client, cfg);
}

/** Silence the NestJS Logger so test output stays clean. */
beforeAll(() => {
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Config / auth init
// ---------------------------------------------------------------------------

describe('CopilotLlmAdapter — config / auth init', () => {
  const realEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Snapshot and clear relevant env vars.
    for (const key of [
      'COPILOT_TOKEN',
      'COPILOT_MODEL',
      'COPILOT_MAX_RETRIES',
      'COPILOT_RETRY_DELAY_MS',
    ]) {
      realEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore env.
    for (const [key, value] of Object.entries(realEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('throws INVALID_INPUT when COPILOT_TOKEN is absent', () => {
    expect(() => CopilotLlmAdapter.loadConfig()).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' })
    );
  });

  it('throws INVALID_INPUT when COPILOT_TOKEN is blank', () => {
    process.env['COPILOT_TOKEN'] = '   ';
    expect(() => CopilotLlmAdapter.loadConfig()).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' })
    );
  });

  it('loads valid config from env', () => {
    process.env['COPILOT_TOKEN'] = 'my-token';
    process.env['COPILOT_MODEL'] = 'gpt-4-turbo';
    process.env['COPILOT_MAX_RETRIES'] = '5';
    process.env['COPILOT_RETRY_DELAY_MS'] = '200';

    const cfg = CopilotLlmAdapter.loadConfig();

    expect(cfg.token).toBe('my-token');
    expect(cfg.model).toBe('gpt-4-turbo');
    expect(cfg.maxRetries).toBe(5);
    expect(cfg.retryDelayMs).toBe(200);
  });

  it('applies defaults for optional env vars', () => {
    process.env['COPILOT_TOKEN'] = 'tok';

    const cfg = CopilotLlmAdapter.loadConfig();

    expect(cfg.model).toBe('gpt-4o');
    expect(cfg.maxRetries).toBe(3);
    expect(cfg.retryDelayMs).toBe(500);
  });

  it('throws INVALID_INPUT for a non-numeric COPILOT_MAX_RETRIES', () => {
    process.env['COPILOT_TOKEN'] = 'tok';
    process.env['COPILOT_MAX_RETRIES'] = 'nope';

    expect(() => CopilotLlmAdapter.loadConfig()).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' })
    );
  });

  it('throws INVALID_INPUT for an invalid COPILOT_RETRY_DELAY_MS', () => {
    process.env['COPILOT_TOKEN'] = 'tok';
    process.env['COPILOT_RETRY_DELAY_MS'] = 'bad';

    expect(() => CopilotLlmAdapter.loadConfig()).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' })
    );
  });

  it('constructs successfully when config is injected directly (no env required)', () => {
    const client = makeMockClient();
    expect(() => buildAdapter(client)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// complete()
// ---------------------------------------------------------------------------

describe('CopilotLlmAdapter — complete()', () => {
  it('returns the model text on success', async () => {
    const client = makeMockClient();
    client.complete.mockResolvedValueOnce({ text: 'Hello, world!', finishReason: 'stop' });

    const adapter = buildAdapter(client);
    const result = await adapter.complete('Say hello');

    expect(result).toBe('Hello, world!');
  });

  it('passes a system message when opts.system is set', async () => {
    const client = makeMockClient();
    client.complete.mockResolvedValueOnce({ text: 'ok' });

    const adapter = buildAdapter(client);
    await adapter.complete('hi', { system: 'be concise' });

    const [messages] = client.complete.mock.calls[0];
    expect(messages[0]).toEqual({ role: 'system', content: 'be concise' });
    expect(messages[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('omits the system message when opts.system is absent', async () => {
    const client = makeMockClient();
    client.complete.mockResolvedValueOnce({ text: 'ok' });

    const adapter = buildAdapter(client);
    await adapter.complete('hi');

    const [messages] = client.complete.mock.calls[0];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
  });

  it('rejects with INVALID_INPUT for an empty prompt', async () => {
    const adapter = buildAdapter(makeMockClient());

    await expect(adapter.complete('')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects with INVALID_INPUT for a whitespace-only prompt', async () => {
    const adapter = buildAdapter(makeMockClient());

    await expect(adapter.complete('   ')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('rejects with CONTENT_FILTERED when finishReason is content_filter', async () => {
    const client = makeMockClient();
    client.complete.mockResolvedValueOnce({ text: '', finishReason: 'content_filter' });

    await expect(buildAdapter(client).complete('prompt')).rejects.toMatchObject({
      code: 'CONTENT_FILTERED',
    });
  });

  it('rejects with PROVIDER_ERROR for a malformed (non-string) response text', async () => {
    const client = makeMockClient();
    // Simulate SDK returning unexpected shape — cast to satisfy TS.
    client.complete.mockResolvedValueOnce({ text: null as unknown as string });

    await expect(buildAdapter(client).complete('prompt')).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    });
  });
});

// ---------------------------------------------------------------------------
// completeJson()
// ---------------------------------------------------------------------------

describe('CopilotLlmAdapter — completeJson()', () => {
  const schema: ObjectSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      score: { type: 'number' },
    },
    required: ['name', 'score'],
  };

  it('parses and returns a valid JSON response', async () => {
    const client = makeMockClient();
    const payload = { name: 'Alice', score: 42 };
    client.complete.mockResolvedValueOnce({ text: JSON.stringify(payload) });

    const adapter = buildAdapter(client);
    const result = await adapter.completeJson<typeof payload>('give me json', schema);

    expect(result).toEqual(payload);
  });

  it('rejects with SCHEMA_VALIDATION when the model emits non-JSON text', async () => {
    const client = makeMockClient();
    client.complete.mockResolvedValueOnce({ text: 'not json at all' });

    await expect(buildAdapter(client).completeJson('p', schema)).rejects.toMatchObject({
      code: 'SCHEMA_VALIDATION',
    });
  });

  it('rejects with SCHEMA_VALIDATION when JSON does not match schema (missing required field)', async () => {
    const client = makeMockClient();
    client.complete.mockResolvedValueOnce({ text: JSON.stringify({ name: 'Bob' }) });

    const err = await buildAdapter(client)
      .completeJson('p', schema)
      .then(
        () => {
          throw new Error('expected rejection');
        },
        (e: LlmError) => e
      );

    expect(err).toBeInstanceOf(LlmError);
    expect(err.code).toBe('SCHEMA_VALIDATION');
    // detail should carry the raw output and failing path.
    expect((err.detail as { path: string }).path).toMatch(/score/);
    expect((err.detail as { output: unknown }).output).toEqual({ name: 'Bob' });
  });

  it('rejects with SCHEMA_VALIDATION when JSON has wrong type for a field', async () => {
    const client = makeMockClient();
    client.complete.mockResolvedValueOnce({
      text: JSON.stringify({ name: 'Bob', score: 'not-a-number' }),
    });

    await expect(buildAdapter(client).completeJson('p', schema)).rejects.toMatchObject({
      code: 'SCHEMA_VALIDATION',
    });
  });

  it('rejects with INVALID_INPUT for an empty prompt', async () => {
    await expect(buildAdapter(makeMockClient()).completeJson('', schema)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('rejects with INVALID_INPUT when schema is missing', async () => {
    await expect(
      buildAdapter(makeMockClient()).completeJson('p', undefined as unknown as JsonSchema)
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('appends a JSON instruction to the prompt', async () => {
    const client = makeMockClient();
    client.complete.mockResolvedValueOnce({ text: JSON.stringify({ name: 'x', score: 1 }) });

    await buildAdapter(client).completeJson('original', schema);

    const [messages] = client.complete.mock.calls[0];
    const userContent = messages.find((m) => m.role === 'user')?.content ?? '';
    expect(userContent).toContain('original');
    expect(userContent.toLowerCase()).toContain('json');
  });
});

// ---------------------------------------------------------------------------
// countTokens()
// ---------------------------------------------------------------------------

describe('CopilotLlmAdapter — countTokens()', () => {
  const adapter = buildAdapter(makeMockClient());

  it('returns 0 for an empty string', () => {
    expect(adapter.countTokens('')).toBe(0);
  });

  it('returns a positive integer for non-empty text', () => {
    expect(adapter.countTokens('hello world')).toBeGreaterThan(0);
  });

  it('is deterministic for the same input', () => {
    expect(adapter.countTokens('foo')).toBe(adapter.countTokens('foo'));
  });

  it('returns higher estimates for longer text', () => {
    expect(adapter.countTokens('a'.repeat(100))).toBeGreaterThan(
      adapter.countTokens('a'.repeat(10))
    );
  });
});

// ---------------------------------------------------------------------------
// stream()
// ---------------------------------------------------------------------------

describe('CopilotLlmAdapter — stream()', () => {
  async function* makeGen(chunks: string[]): AsyncGenerator<string> {
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  it('yields chunks from the client stream', async () => {
    const client = makeMockClient();
    client.stream.mockReturnValueOnce(makeGen(['Hello', ' ', 'World']));

    const adapter = buildAdapter(client);
    const chunks: string[] = [];
    for await (const chunk of adapter.stream('prompt')) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['Hello', ' ', 'World']);
  });

  it('rejects with INVALID_INPUT for an empty prompt', async () => {
    const adapter = buildAdapter(makeMockClient());

    await expect(
      (async () => {
        for await (const _c of adapter.stream('')) {
          // drain
        }
      })()
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('maps SDK errors to LlmError during streaming', async () => {
    const client = makeMockClient();
    const apiErr = { status: 500, message: 'Internal Server Error' };
    client.stream.mockImplementationOnce(() => {
      // Return an async iterable that throws on first iteration.
      return {
        [Symbol.asyncIterator]() {
          return {
            next() {
              return Promise.reject(apiErr);
            },
            return() {
              return Promise.resolve({ value: undefined, done: true as const });
            },
          };
        },
      };
    });

    await expect(
      (async () => {
        for await (const _c of buildAdapter(client).stream('prompt')) {
          // drain
        }
      })()
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
  });
});

// ---------------------------------------------------------------------------
// Retry logic
// ---------------------------------------------------------------------------

describe('CopilotLlmAdapter — retry-with-backoff', () => {
  it('retries a transient error and succeeds on the third attempt', async () => {
    const client = makeMockClient();
    // First two calls fail with a retriable 503, third succeeds.
    client.complete
      .mockRejectedValueOnce({ status: 503, message: 'Service Unavailable' })
      .mockRejectedValueOnce({ status: 503, message: 'Service Unavailable' })
      .mockResolvedValueOnce({ text: 'success after retries' });

    const adapter = buildAdapter(client, testConfig({ maxRetries: 3, retryDelayMs: 0 }));
    const result = await adapter.complete('prompt');

    expect(result).toBe('success after retries');
    expect(client.complete).toHaveBeenCalledTimes(3);
  });

  it('rejects with RATE_LIMITED after all retries are exhausted (429)', async () => {
    const client = makeMockClient();
    client.complete.mockRejectedValue({ status: 429, message: 'Too Many Requests' });

    const adapter = buildAdapter(client, testConfig({ maxRetries: 3, retryDelayMs: 0 }));

    await expect(adapter.complete('prompt')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(client.complete).toHaveBeenCalledTimes(3);
  });

  it('rejects with PROVIDER_ERROR after all retries are exhausted (500)', async () => {
    const client = makeMockClient();
    client.complete.mockRejectedValue({ status: 500, message: 'Internal Server Error' });

    const adapter = buildAdapter(client, testConfig({ maxRetries: 2, retryDelayMs: 0 }));

    await expect(adapter.complete('prompt')).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(client.complete).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a non-retriable auth error (401)', async () => {
    const client = makeMockClient();
    client.complete.mockRejectedValue({ status: 401, message: 'Unauthorized' });

    const adapter = buildAdapter(client, testConfig({ maxRetries: 5, retryDelayMs: 0 }));

    await expect(adapter.complete('prompt')).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    // Should bail immediately — no retries for 401.
    expect(client.complete).toHaveBeenCalledTimes(1);
  });

  it('maps a 429 to RATE_LIMITED even on the very first attempt', async () => {
    const client = makeMockClient();
    client.complete.mockRejectedValueOnce({ status: 429, message: 'Rate limited' });

    const adapter = buildAdapter(client, testConfig({ maxRetries: 1, retryDelayMs: 0 }));

    await expect(adapter.complete('p')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('treats a network-level error (no status) as retriable and succeeds on retry', async () => {
    const client = makeMockClient();
    // Network error has no status field — should be treated as transient / retriable.
    const networkErr = { message: 'ECONNRESET' };
    client.complete.mockRejectedValueOnce(networkErr).mockResolvedValueOnce({ text: 'recovered' });

    const adapter = buildAdapter(client, testConfig({ maxRetries: 2, retryDelayMs: 0 }));
    const result = await adapter.complete('p');

    expect(result).toBe('recovered');
    expect(client.complete).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

describe('CopilotLlmAdapter — error mapping', () => {
  it('maps a 401 to PROVIDER_ERROR (auth error)', async () => {
    const client = makeMockClient();
    client.complete.mockRejectedValue({ status: 401, message: 'Unauthorized' });

    await expect(buildAdapter(client).complete('p')).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    });
  });

  it('maps a 403 to PROVIDER_ERROR (auth error)', async () => {
    const client = makeMockClient();
    client.complete.mockRejectedValue({ status: 403, message: 'Forbidden' });

    await expect(buildAdapter(client).complete('p')).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    });
  });

  it('maps a 408 to TIMEOUT', async () => {
    const client = makeMockClient();
    client.complete.mockRejectedValue({ status: 408, message: 'Request Timeout' });

    // 408 is NOT in the retriable-status set — adapter bails on first attempt.
    const adapter = buildAdapter(client, testConfig({ maxRetries: 3, retryDelayMs: 0 }));
    await expect(adapter.complete('p')).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(client.complete).toHaveBeenCalledTimes(1);
  });

  it('maps a content_filter code to CONTENT_FILTERED', async () => {
    const client = makeMockClient();
    client.complete.mockRejectedValue({ code: 'content_filter', message: 'Filtered' });

    const adapter = buildAdapter(client, testConfig({ maxRetries: 1 }));
    await expect(adapter.complete('p')).rejects.toMatchObject({ code: 'CONTENT_FILTERED' });
  });

  it('preserves the original cause on the LlmError', async () => {
    const client = makeMockClient();
    const rawErr = { status: 500, message: 'boom' };
    client.complete.mockRejectedValue(rawErr);

    const adapter = buildAdapter(client, testConfig({ maxRetries: 1, retryDelayMs: 0 }));
    const err = await adapter.complete('p').then(
      () => {
        throw new Error('expected rejection');
      },
      (e: LlmError) => e
    );

    expect(err.cause).toBe(rawErr);
  });
});
