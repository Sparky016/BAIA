import { JsonSchema, LlmError, ObjectSchema, validateJsonSchema } from './llm.service';
import { MockLlmService } from './mock-llm.service';

describe('MockLlmService', () => {
  let service: MockLlmService;

  beforeEach(() => {
    service = new MockLlmService();
  });

  describe('complete', () => {
    it('is deterministic for the same input', async () => {
      const a = await service.complete('hello');
      const b = await service.complete('hello');
      expect(a).toBe(b);
      expect(a).toContain('hello');
    });

    it('incorporates the system option deterministically', async () => {
      const out = await service.complete('hi', { system: 'be terse' });
      expect(out).toBe('[sys:be terse] mock-completion: hi');
    });

    it('rejects an empty/whitespace prompt with INVALID_INPUT', async () => {
      await expect(service.complete('   ')).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
      await expect(service.complete('')).rejects.toBeInstanceOf(LlmError);
    });
  });

  describe('completeJson', () => {
    const objectSchema: ObjectSchema = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        count: { type: 'integer' },
        tags: { type: 'array', items: { type: 'string' } },
        active: { type: 'boolean' },
      },
      required: ['title', 'count', 'tags', 'active'],
    };

    it('returns output that satisfies the schema (valid path)', async () => {
      const result = await service.completeJson<Record<string, unknown>>(
        'give me an object',
        objectSchema
      );
      // The returned value genuinely passes the real validator.
      expect(validateJsonSchema(result, objectSchema)).toBeNull();
      expect(result).toEqual({
        title: 'mock',
        count: 0,
        tags: ['mock'],
        active: false,
      });
    });

    it('is deterministic across calls', async () => {
      const a = await service.completeJson('p', objectSchema);
      const b = await service.completeJson('p', objectSchema);
      expect(a).toEqual(b);
    });

    it('honours enum schemas', async () => {
      const schema: JsonSchema = { type: 'string', enum: ['x', 'y'] };
      const result = await service.completeJson<string>('pick', schema);
      expect(result).toBe('x');
    });

    it('synthesises valid output for a top-level array schema', async () => {
      const schema: JsonSchema = {
        type: 'array',
        items: { type: 'integer' },
      };
      const result = await service.completeJson<number[]>('list', schema);
      expect(validateJsonSchema(result, schema)).toBeNull();
    });

    it('rejects with SCHEMA_VALIDATION when forced invalid (object)', async () => {
      await expect(
        service.completeJson('p', objectSchema, {
          system: MockLlmService.FORCE_INVALID_JSON,
        })
      ).rejects.toMatchObject({ code: 'SCHEMA_VALIDATION' });
    });

    it('SCHEMA_VALIDATION error carries the offending output + path detail', async () => {
      const schema: JsonSchema = { type: 'string' };
      await service
        .completeJson('p', schema, {
          system: MockLlmService.FORCE_INVALID_JSON,
        })
        .then(
          () => {
            throw new Error('expected rejection');
          },
          (err: LlmError) => {
            expect(err).toBeInstanceOf(LlmError);
            expect(err.code).toBe('SCHEMA_VALIDATION');
            expect(err.detail).toMatchObject({ output: 12345 });
            expect((err.detail as { path: string }).path).toMatch(/expected/);
          }
        );
    });

    it('forces invalid output for each primitive kind', async () => {
      const kinds: JsonSchema[] = [
        { type: 'string' },
        { type: 'number' },
        { type: 'boolean' },
        { type: 'array', items: { type: 'string' } },
      ];
      for (const schema of kinds) {
        await expect(
          service.completeJson('p', schema, {
            system: MockLlmService.FORCE_INVALID_JSON,
          })
        ).rejects.toMatchObject({ code: 'SCHEMA_VALIDATION' });
      }
    });

    it('rejects an empty prompt with INVALID_INPUT', async () => {
      await expect(service.completeJson('', { type: 'string' })).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
    });

    it('rejects a missing schema with INVALID_INPUT', async () => {
      await expect(
        service.completeJson('p', undefined as unknown as JsonSchema)
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });
  });

  describe('countTokens', () => {
    it('returns 0 for empty string', () => {
      expect(service.countTokens('')).toBe(0);
    });

    it('returns a deterministic positive estimate for non-empty text', () => {
      expect(service.countTokens('abcd')).toBe(1);
      expect(service.countTokens('abcde')).toBe(2);
      expect(service.countTokens('x')).toBe(service.countTokens('y'));
    });
  });

  describe('stream', () => {
    it('yields chunks that concatenate back to the full completion', async () => {
      const prompt = 'the quick brown fox';
      const full = await service.complete(prompt);
      let joined = '';
      const chunks: string[] = [];
      for await (const chunk of service.stream(prompt)) {
        chunks.push(chunk);
        joined += chunk;
      }
      expect(chunks.length).toBeGreaterThan(1);
      expect(joined).toBe(full);
    });

    it('propagates INVALID_INPUT for an empty prompt', async () => {
      await expect(
        (async () => {
          for await (const _chunk of service.stream('')) {
            // drain
          }
        })()
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });
  });
});
