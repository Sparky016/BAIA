import { Chunk, ChunkBoundary, TokenCounter, chunk } from './chunking';
import { MockLlmService } from './mock-llm.service';

/**
 * Deterministic word-based counter: tokens = number of whitespace-delimited
 * words. Empty / whitespace-only text → 0. Simple and stable for assertions.
 */
const wordCounter: TokenCounter = (text: string): number => {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
};

/** Deterministic char-based counter: 1 token per character. */
const charCounter: TokenCounter = (text: string): number => text.length;

/** Reassemble the *new* content of chunks (dropping overlap) → original text. */
function reassembleNewContent(text: string, chunks: Chunk[]): string {
  let out = '';
  let covered = 0; // highest end already written
  for (const c of chunks) {
    const start = Math.max(c.sourceRange.start, covered);
    if (start < c.sourceRange.end) {
      out += text.slice(start, c.sourceRange.end);
      covered = c.sourceRange.end;
    }
  }
  return out;
}

describe('chunk', () => {
  describe('input validation', () => {
    it('throws TypeError when text is not a string', () => {
      expect(() =>
        chunk(123 as unknown as string, { maxTokens: 10, countTokens: wordCounter })
      ).toThrow(TypeError);
    });

    it('throws RangeError for non-positive / non-integer maxTokens', () => {
      expect(() => chunk('x', { maxTokens: 0, countTokens: wordCounter })).toThrow(RangeError);
      expect(() => chunk('x', { maxTokens: -5, countTokens: wordCounter })).toThrow(RangeError);
      expect(() => chunk('x', { maxTokens: 2.5, countTokens: wordCounter })).toThrow(RangeError);
    });

    it('throws RangeError for invalid overlap', () => {
      expect(() => chunk('x', { maxTokens: 10, overlap: -1, countTokens: wordCounter })).toThrow(
        RangeError
      );
      expect(() => chunk('x', { maxTokens: 10, overlap: 1.5, countTokens: wordCounter })).toThrow(
        RangeError
      );
    });

    it('throws RangeError when overlap >= maxTokens', () => {
      expect(() => chunk('x', { maxTokens: 5, overlap: 5, countTokens: wordCounter })).toThrow(
        RangeError
      );
      expect(() => chunk('x', { maxTokens: 5, overlap: 6, countTokens: wordCounter })).toThrow(
        RangeError
      );
    });

    it('throws TypeError when no counter is supplied', () => {
      expect(() =>
        chunk('x', {
          maxTokens: 5,
          countTokens: undefined as unknown as TokenCounter,
        })
      ).toThrow(TypeError);
      expect(() =>
        chunk('x', {
          maxTokens: 5,
          countTokens: null as unknown as TokenCounter,
        })
      ).toThrow(TypeError);
    });
  });

  describe('empty input', () => {
    it('returns an empty array for an empty string', () => {
      expect(chunk('', { maxTokens: 10, countTokens: wordCounter })).toEqual([]);
    });

    it('returns an empty array for empty input under every boundary strategy', () => {
      const boundaries: ChunkBoundary[] = ['none', 'line', 'paragraph'];
      for (const boundary of boundaries) {
        expect(chunk('', { maxTokens: 10, boundary, countTokens: wordCounter })).toEqual([]);
      }
    });
  });

  describe('input smaller than the window', () => {
    it('returns a single chunk spanning the whole input', () => {
      const text = 'one two three';
      const result = chunk(text, { maxTokens: 10, countTokens: wordCounter });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        index: 0,
        text,
        tokenCount: 3,
        sourceRange: { start: 0, end: text.length },
      });
    });

    it('handles a single-token input', () => {
      const result = chunk('solo', { maxTokens: 4, countTokens: wordCounter });
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe('solo');
      expect(result[0].tokenCount).toBe(1);
    });
  });

  describe('input requiring N chunks', () => {
    it('splits into the expected number of chunks (none boundary, char counter)', () => {
      // 12 chars, maxTokens 4 → ceil(12/4) = 3 chunks.
      const text = 'abcdefghijkl';
      const result = chunk(text, { maxTokens: 4, boundary: 'none', countTokens: charCounter });
      expect(result).toHaveLength(3);
      expect(result.map((c) => c.text)).toEqual(['abcd', 'efgh', 'ijkl']);
    });

    it('produces N chunks for word-counted multi-line text', () => {
      const text = 'a b\nc d\ne f\ng h';
      const result = chunk(text, { maxTokens: 2, boundary: 'line', countTokens: wordCounter });
      // Each line has 2 words = budget exactly; 4 lines → 4 chunks.
      expect(result).toHaveLength(4);
      expect(result.map((c) => c.text)).toEqual(['a b\n', 'c d\n', 'e f\n', 'g h']);
    });

    it('reassembled new content equals the original text', () => {
      const text = 'alpha beta gamma delta epsilon zeta eta theta';
      const result = chunk(text, { maxTokens: 3, countTokens: wordCounter });
      expect(result.length).toBeGreaterThan(1);
      expect(reassembleNewContent(text, result)).toBe(text);
    });
  });

  describe('hard cap — no chunk exceeds maxTokens', () => {
    const cases: {
      name: string;
      text: string;
      max: number;
      boundary: ChunkBoundary;
      counter: TokenCounter;
    }[] = [
      {
        name: 'plain words',
        text: 'a b c d e f g h i j k',
        max: 3,
        boundary: 'none',
        counter: wordCounter,
      },
      { name: 'char-dense', text: 'x'.repeat(101), max: 7, boundary: 'none', counter: charCounter },
      {
        name: 'lines',
        text: Array.from({ length: 20 }, (_, n) => `line ${n} here`).join('\n'),
        max: 4,
        boundary: 'line',
        counter: wordCounter,
      },
      {
        name: 'paragraphs',
        text: 'p1 a b\n\np2 c d e\n\np3 f',
        max: 3,
        boundary: 'paragraph',
        counter: wordCounter,
      },
    ];

    for (const tc of cases) {
      it(`never exceeds maxTokens (${tc.name})`, () => {
        const result = chunk(tc.text, {
          maxTokens: tc.max,
          boundary: tc.boundary,
          countTokens: tc.counter,
        });
        expect(result.length).toBeGreaterThan(0);
        for (const c of result) {
          expect(c.tokenCount).toBeLessThanOrEqual(tc.max);
          // tokenCount is consistent with the recorded slice + counter.
          expect(c.tokenCount).toBe(tc.counter(c.text));
        }
      });
    }

    it('force-splits a single oversized line below the cap', () => {
      // One line, no newlines, far over budget under char counting.
      const text = 'z'.repeat(50);
      const result = chunk(text, { maxTokens: 8, boundary: 'line', countTokens: charCounter });
      expect(result.length).toBe(Math.ceil(50 / 8));
      for (const c of result) {
        expect(c.tokenCount).toBeLessThanOrEqual(8);
      }
      expect(result.map((c) => c.text).join('')).toBe(text);
    });

    it('makes forward progress even when one character exceeds the budget', () => {
      // Counter where every single char already costs 5 tokens > maxTokens 3.
      const heavy: TokenCounter = (t) => t.length * 5;
      const text = 'abcd';
      const result = chunk(text, { maxTokens: 3, boundary: 'none', countTokens: heavy });
      // One char per chunk (indivisible unit); still terminates, covers all.
      expect(result).toHaveLength(4);
      expect(result.map((c) => c.text).join('')).toBe(text);
      expect(result.map((c) => c.index)).toEqual([0, 1, 2, 3]);
    });
  });

  describe('overlap correctness', () => {
    it('prepends previous-chunk tail tokens to subsequent chunks', () => {
      // Line boundary so chunks break cleanly on word units (no partial-char artefacts).
      const text = 'aa\nbb\ncc\ndd\nee\nff';
      // maxTokens 3 words, overlap 1 word → each chunk re-reads the prior chunk's tail.
      const result = chunk(text, {
        maxTokens: 3,
        overlap: 1,
        boundary: 'line',
        countTokens: wordCounter,
      });
      expect(result.length).toBeGreaterThan(1);
      // First chunk carries no overlap and starts at offset 0.
      expect(result[0].sourceRange.start).toBe(0);
      // Subsequent chunks include overlap; their start is before the previous chunk's end.
      for (let n = 1; n < result.length; n++) {
        expect(result[n].sourceRange.start).toBeLessThan(result[n - 1].sourceRange.end);
        expect(result[n].tokenCount).toBeLessThanOrEqual(3);
      }
    });

    it('the first chunk never carries overlap', () => {
      const text = 'one two three four five six';
      const result = chunk(text, { maxTokens: 2, overlap: 1, countTokens: wordCounter });
      expect(result[0].sourceRange.start).toBe(0);
      expect(result[0].text.startsWith('one')).toBe(true);
    });

    it('overlap=0 produces non-overlapping contiguous ranges', () => {
      const text = 'a b c d e f g h';
      const result = chunk(text, { maxTokens: 2, overlap: 0, countTokens: wordCounter });
      for (let n = 1; n < result.length; n++) {
        expect(result[n].sourceRange.start).toBe(result[n - 1].sourceRange.end);
      }
    });

    it('overlap never makes a chunk exceed maxTokens', () => {
      const text = 'a b c d e f g h i j k l m n';
      const result = chunk(text, { maxTokens: 4, overlap: 3, countTokens: wordCounter });
      for (const c of result) {
        expect(c.tokenCount).toBeLessThanOrEqual(4);
      }
    });

    it('overlap that cannot fit is skipped (no infinite growth)', () => {
      // Single-unit-per-chunk situation with large overlap relative to content.
      const text = 'aa bb cc dd ee';
      const result = chunk(text, { maxTokens: 2, overlap: 1, countTokens: wordCounter });
      for (const c of result) {
        expect(c.tokenCount).toBeLessThanOrEqual(2);
      }
      // Still fully covers the source.
      expect(reassembleNewContent(text, result)).toBe(text);
    });
  });

  describe('boundary preference', () => {
    it('line boundary keeps lines intact when budget allows', () => {
      const text = 'first line\nsecond line\nthird line';
      const result = chunk(text, { maxTokens: 2, boundary: 'line', countTokens: wordCounter });
      // Each line is 2 words → one chunk per line, each ending at a newline.
      expect(result).toHaveLength(3);
      expect(result[0].text).toBe('first line\n');
      expect(result[1].text).toBe('second line\n');
      expect(result[2].text).toBe('third line');
    });

    it('none boundary may break mid-line', () => {
      const text = 'first line\nsecond line';
      const result = chunk(text, { maxTokens: 8, boundary: 'none', countTokens: charCounter });
      // Pure char window ignores the newline boundary.
      expect(result[0].text).toBe('first li');
    });

    it('paragraph boundary keeps blank-line blocks together', () => {
      const text = 'def f():\n  a\n  b\n\ndef g():\n  c';
      const result = chunk(text, {
        maxTokens: 20,
        boundary: 'paragraph',
        countTokens: wordCounter,
      });
      // Both blocks fit in one chunk (small), so a single chunk results,
      // but the segmentation respects the blank-line split when packing.
      expect(reassembleNewContent(text, result)).toBe(text);
      for (const c of result) {
        expect(c.tokenCount).toBeLessThanOrEqual(20);
      }
    });

    it('paragraph boundary splits oversized document at blank lines first', () => {
      const text = 'p1 w1 w2 w3\n\np2 w4 w5 w6\n\np3 w7 w8 w9';
      const result = chunk(text, { maxTokens: 4, boundary: 'paragraph', countTokens: wordCounter });
      // Each paragraph is 4 words = budget; expect one chunk per paragraph.
      expect(result).toHaveLength(3);
      expect(result[0].text.startsWith('p1')).toBe(true);
      expect(result[1].text.startsWith('p2')).toBe(true);
      expect(result[2].text.startsWith('p3')).toBe(true);
    });
  });

  describe('deterministic ordering', () => {
    it('indexes are sequential starting at 0', () => {
      const text = 'a b c d e f g h i j';
      const result = chunk(text, { maxTokens: 3, countTokens: wordCounter });
      expect(result.map((c) => c.index)).toEqual(result.map((_, n) => n));
    });

    it('sourceRange start offsets are monotonically non-decreasing', () => {
      const text = 'a b c d e f g h i j k l';
      const result = chunk(text, { maxTokens: 3, overlap: 1, countTokens: wordCounter });
      for (let n = 1; n < result.length; n++) {
        expect(result[n].sourceRange.start).toBeGreaterThanOrEqual(result[n - 1].sourceRange.start);
        expect(result[n].sourceRange.end).toBeGreaterThan(result[n - 1].sourceRange.end);
      }
    });

    it('is a pure function — repeated calls yield identical output', () => {
      const text = 'the quick brown fox jumps over the lazy dog again twice';
      const opts = {
        maxTokens: 3,
        overlap: 1,
        boundary: 'line' as ChunkBoundary,
        countTokens: wordCounter,
      };
      const a = chunk(text, opts);
      const b = chunk(text, opts);
      expect(a).toEqual(b);
    });
  });

  describe('LlmService counter integration', () => {
    it('accepts an LlmService and uses its countTokens', () => {
      const llm = new MockLlmService();
      // MockLlmService counts ~4 chars/token. 40 chars, maxTokens 3 → multiple chunks.
      const text = 'x'.repeat(40);
      const result = chunk(text, { maxTokens: 3, boundary: 'none', countTokens: llm });
      expect(result.length).toBeGreaterThan(1);
      for (const c of result) {
        expect(c.tokenCount).toBeLessThanOrEqual(3);
        expect(c.tokenCount).toBe(llm.countTokens(c.text));
      }
      expect(result.map((c) => c.text).join('')).toBe(text);
    });

    it('returns a single chunk via LlmService when input fits', () => {
      const llm = new MockLlmService();
      const text = 'tiny';
      const result = chunk(text, { maxTokens: 100, countTokens: llm });
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe(text);
    });
  });
});
