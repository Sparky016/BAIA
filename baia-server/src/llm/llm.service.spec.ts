import { JsonSchema, LlmError, ObjectSchema, validateJsonSchema } from './llm.service';

describe('LlmError', () => {
  it('carries a stable code, message, detail and cause', () => {
    const cause = new Error('boom');
    const err = new LlmError('PROVIDER_ERROR', 'failed', { foo: 1 }, cause);
    expect(err).toBeInstanceOf(LlmError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('LlmError');
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.message).toBe('failed');
    expect(err.detail).toEqual({ foo: 1 });
    expect(err.cause).toBe(cause);
  });

  it('is catchable as LlmError after being thrown (prototype chain intact)', () => {
    try {
      throw new LlmError('TIMEOUT', 'too slow');
    } catch (e) {
      expect(e instanceof LlmError).toBe(true);
    }
  });
});

describe('validateJsonSchema', () => {
  describe('primitives', () => {
    it('accepts a valid string', () => {
      expect(validateJsonSchema('hi', { type: 'string' })).toBeNull();
    });

    it('rejects a non-string', () => {
      expect(validateJsonSchema(42, { type: 'string' })).toMatch(/expected string/);
    });

    it('accepts an allowed enum value and rejects others', () => {
      const schema: JsonSchema = { type: 'string', enum: ['a', 'b'] };
      expect(validateJsonSchema('a', schema)).toBeNull();
      expect(validateJsonSchema('c', schema)).toMatch(/not in enum/);
    });

    it('validates number, integer and NaN', () => {
      expect(validateJsonSchema(1.5, { type: 'number' })).toBeNull();
      expect(validateJsonSchema(3, { type: 'integer' })).toBeNull();
      expect(validateJsonSchema(3.2, { type: 'integer' })).toMatch(/expected integer/);
      expect(validateJsonSchema(NaN, { type: 'number' })).toMatch(/expected number/);
      expect(validateJsonSchema('x', { type: 'number' })).toMatch(/expected number/);
    });

    it('validates boolean', () => {
      expect(validateJsonSchema(true, { type: 'boolean' })).toBeNull();
      expect(validateJsonSchema('true', { type: 'boolean' })).toMatch(/expected boolean/);
    });
  });

  describe('arrays', () => {
    const schema: JsonSchema = { type: 'array', items: { type: 'number' } };

    it('accepts an array of valid items', () => {
      expect(validateJsonSchema([1, 2, 3], schema)).toBeNull();
    });

    it('rejects a non-array', () => {
      expect(validateJsonSchema('nope', schema)).toMatch(/expected array/);
    });

    it('reports the failing element index in the path', () => {
      expect(validateJsonSchema([1, 'two', 3], schema)).toMatch(/\$\[1\]/);
    });
  });

  describe('objects', () => {
    const schema: ObjectSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name'],
    };

    it('accepts a valid object', () => {
      expect(validateJsonSchema({ name: 'x', age: 4 }, schema)).toBeNull();
    });

    it('accepts an object missing only optional props', () => {
      expect(validateJsonSchema({ name: 'x' }, schema)).toBeNull();
    });

    it('rejects a non-object (null/array)', () => {
      expect(validateJsonSchema(null, schema)).toMatch(/expected object/);
      expect(validateJsonSchema([], schema)).toMatch(/expected object/);
    });

    it('rejects a missing required property', () => {
      expect(validateJsonSchema({ age: 4 }, schema)).toMatch(/\$\.name: required/);
    });

    it('rejects an additional property by default (strict)', () => {
      expect(validateJsonSchema({ name: 'x', extra: 1 }, schema)).toMatch(
        /\$\.extra: additional property not allowed/
      );
    });

    it('allows additional properties when additionalProperties is true', () => {
      const loose: ObjectSchema = { ...schema, additionalProperties: true };
      expect(validateJsonSchema({ name: 'x', extra: 1 }, loose)).toBeNull();
    });

    it('reports a nested failing path', () => {
      const nested: ObjectSchema = {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'string' } },
        },
        required: ['items'],
      };
      expect(validateJsonSchema({ items: ['a', 7] }, nested)).toMatch(/\$\.items\[1\]/);
    });

    it('validates a present optional property', () => {
      expect(validateJsonSchema({ name: 'x', age: 'old' }, schema)).toMatch(
        /\$\.age: expected integer/
      );
    });
  });
});
