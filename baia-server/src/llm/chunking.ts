/**
 * Token-aware text chunking for context-window optimisation.
 *
 * Large inputs (source files, DOM snapshots, transcripts) routinely exceed an
 * LLM's context window. {@link chunk} slices `text` into ordered pieces that
 * each fit within a `maxTokens` budget, optionally overlapping consecutive
 * chunks so boundary context isn't lost, and — when asked — splitting on
 * semantic boundaries (lines / blank-line-separated blocks) rather than mid-token.
 *
 * ## Design contract
 * - **Hard cap.** No returned chunk ever exceeds `maxTokens` (measured with the
 *   injected {@link TokenCounter}). This holds even when a single semantic unit
 *   (e.g. one very long line) is itself larger than the budget — such units are
 *   force-split at a character granularity that still respects the cap.
 * - **Deterministic.** Output is a pure function of `(text, options, counter)`.
 *   No clock, randomness, or I/O.
 * - **Total coverage, ordered.** Concatenating chunks in `index` order (ignoring
 *   overlap re-reads) reproduces the original `text`; `sourceRange` offsets are
 *   monotonically non-decreasing and index into the original string.
 * - **Testable.** The token counter is injected — pass {@link LlmService} or any
 *   `(text) => number`. Tests use {@link MockLlmService} or a trivial counter.
 *
 * Out of scope (per DEV_TASK_14): repository walking (DEV_TASK_23).
 */

import { LlmService } from './llm.service';

/**
 * A synchronous, side-effect-free token estimator. Matches the shape of
 * {@link LlmService.countTokens}; any compatible function may be supplied.
 *
 * @param text Text to measure (empty string must return `0`).
 * @returns A non-negative token estimate.
 */
export type TokenCounter = (text: string) => number;

/**
 * Semantic boundary strategy used when slicing.
 *
 * - `'none'`      — split purely on the token budget; chunks may begin/end
 *                   mid-line. Fastest packing, no semantic awareness.
 * - `'line'`      — prefer to break between lines (`\n`). Keeps individual
 *                   source/code lines intact where the budget allows.
 * - `'paragraph'` — prefer to break between blank-line-separated blocks
 *                   (e.g. functions, paragraphs, DOM sections), falling back to
 *                   line then character splitting for oversized blocks.
 */
export type ChunkBoundary = 'none' | 'line' | 'paragraph';

/** Inclusive-start, exclusive-end character offsets into the original `text`. */
export interface SourceRange {
  /** Index of the first character of the chunk in the original text. */
  readonly start: number;
  /** Index one past the last character of the chunk in the original text. */
  readonly end: number;
}

/** A single ordered slice of the input plus its metadata. */
export interface Chunk {
  /** Zero-based position in the ordered output (`0,1,2,…`). */
  readonly index: number;
  /** The chunk's text content (including any leading overlap). */
  readonly text: string;
  /** Token count of {@link Chunk.text} per the injected counter. Never `> maxTokens`. */
  readonly tokenCount: number;
  /** Character span of this chunk (including overlap) in the original text. */
  readonly sourceRange: SourceRange;
}

/** Options controlling {@link chunk}. */
export interface ChunkOptions {
  /**
   * Maximum tokens per chunk (strict upper bound). Must be a positive integer.
   */
  readonly maxTokens: number;
  /**
   * Number of tokens from the tail of the previous chunk to prepend to the next
   * chunk, preserving boundary context. Defaults to `0`. Must be a non-negative
   * integer strictly less than `maxTokens`.
   */
  readonly overlap?: number;
  /**
   * Semantic boundary preference. Defaults to `'none'`.
   */
  readonly boundary?: ChunkBoundary;
  /**
   * Token counter. Either a bare {@link TokenCounter} function or an
   * {@link LlmService} (its `countTokens` method is used). Required so chunking
   * is deterministic and unit-testable.
   */
  readonly countTokens: TokenCounter | LlmService;
}

/** Narrow an {@link LlmService} | {@link TokenCounter} union to a callable counter. */
function resolveCounter(counter: TokenCounter | LlmService): TokenCounter {
  if (typeof counter === 'function') {
    return counter;
  }
  // Bind so `this` is preserved if the implementation relies on instance state.
  return (text: string): number => counter.countTokens(text);
}

/** A contiguous slice of the source identified only by its char offsets. */
interface Segment {
  readonly start: number;
  readonly end: number;
}

/**
 * Split `[start,end)` of `text` into atomic segments according to `boundary`.
 *
 * Each returned segment is a candidate "unit" the packer will try to keep whole.
 * Separators (newlines / blank lines) are attached to the *end* of the segment
 * that precedes them so that re-concatenation is loss-free and offsets stay
 * contiguous (no gaps, no overlaps).
 */
function segment(text: string, boundary: ChunkBoundary): Segment[] {
  const len = text.length;
  if (len === 0) {
    return [];
  }
  if (boundary === 'none') {
    return [{ start: 0, end: len }];
  }

  if (boundary === 'line') {
    return splitByPattern(text, /\n/g);
  }

  // 'paragraph': blank-line-separated blocks (one or more newlines, where the
  // run contains at least two newlines i.e. an empty line). We split on the
  // boundary *after* a blank-line run.
  return splitByPattern(text, /\n[ \t]*\n/g);
}

/**
 * Split `text` into segments at every match of `pattern`, attaching the matched
 * separator to the preceding segment. Returns contiguous, gap-free segments
 * covering `[0, text.length)`.
 */
function splitByPattern(text: string, pattern: RegExp): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  // Reset lastIndex defensively (pattern is created locally, but be safe).
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const sepEnd = match.index + match[0].length;
    segments.push({ start: cursor, end: sepEnd });
    cursor = sepEnd;
    // Guard against zero-width matches (shouldn't happen for our patterns).
    if (match.index === pattern.lastIndex) {
      pattern.lastIndex++;
    }
  }
  if (cursor < text.length) {
    segments.push({ start: cursor, end: text.length });
  }
  return segments;
}

/**
 * Force-split a single oversized segment into char-bounded pieces that each fit
 * within `maxTokens`. Used when one semantic unit (or, under `'none'`, the whole
 * input) exceeds the budget on its own.
 *
 * Uses an exponential-probe + binary-search to find, from `start`, the largest
 * prefix whose token count is `<= maxTokens`. Guarantees forward progress: even
 * if a single character measures as `> maxTokens`, it emits that one character
 * (the strict cap cannot be honoured for an indivisible unit, so we make the
 * smallest possible violation explicit and bounded to one char).
 */
function hardSplit(
  text: string,
  start: number,
  end: number,
  maxTokens: number,
  count: TokenCounter
): Segment[] {
  const pieces: Segment[] = [];
  let cursor = start;
  while (cursor < end) {
    const next = largestFittingEnd(text, cursor, end, maxTokens, count);
    pieces.push({ start: cursor, end: next });
    cursor = next;
  }
  return pieces;
}

/**
 * Find the largest `e` in `(from, to]` such that `count(text[from..e]) <= max`.
 * If even a single character exceeds `max`, returns `from + 1` (forward
 * progress; one-char minimum).
 */
function largestFittingEnd(
  text: string,
  from: number,
  to: number,
  max: number,
  count: TokenCounter
): number {
  // Exponential probe to bracket the boundary, then binary-search within it.
  let lo = from + 1; // always at least one char of progress
  let hi = lo;
  let step = 1;
  while (hi < to) {
    const probe = Math.min(to, from + step);
    if (count(text.slice(from, probe)) <= max) {
      lo = probe;
      if (probe === to) {
        break;
      }
      step *= 2;
      hi = Math.min(to, from + step);
    } else {
      hi = probe;
      break;
    }
  }
  // Binary search for the largest fitting end in [lo, hi].
  let best = lo;
  let low = lo;
  let high = hi;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (mid <= from || mid > to) {
      break;
    }
    if (count(text.slice(from, mid)) <= max) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  // `best` fits; ensure strict forward progress.
  return Math.max(best, from + 1);
}

/**
 * Compute the overlap start offset: walk back from `prevEnd` to include roughly
 * `overlapTokens` tokens of the previous chunk's tail, without crossing
 * `minStart` (the start of already-consumed content) and without making the
 * combined slice exceed `maxTokens`.
 */
function overlapStart(
  text: string,
  prevEnd: number,
  minStart: number,
  overlapTokens: number,
  maxTokens: number,
  count: TokenCounter
): number {
  if (overlapTokens <= 0 || prevEnd <= minStart) {
    return prevEnd;
  }
  // Largest prefix-from-end that is <= overlapTokens. Binary search the start.
  let lo = minStart;
  let hi = prevEnd;
  let best = prevEnd;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const tokens = count(text.slice(mid, prevEnd));
    if (tokens <= overlapTokens) {
      best = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  // Never let overlap alone meet/exceed the budget — leave room for new content.
  if (count(text.slice(best, prevEnd)) >= maxTokens) {
    return prevEnd;
  }
  return best;
}

function isPositiveInteger(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

function isNonNegativeInteger(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

/**
 * Split `text` into ordered, token-bounded {@link Chunk}s.
 *
 * @param text    The full input. Empty / whitespace-free-of-content returns `[]`.
 * @param options See {@link ChunkOptions}. `maxTokens` and `countTokens` required.
 * @returns Ordered chunks; each `tokenCount <= maxTokens`. Empty input → `[]`.
 * @throws {RangeError} if `maxTokens` is not a positive integer, or `overlap` is
 *         not a non-negative integer `< maxTokens`.
 * @throws {TypeError} if `text` is not a string or no counter is supplied.
 */
export function chunk(text: string, options: ChunkOptions): Chunk[] {
  if (typeof text !== 'string') {
    throw new TypeError('chunk(text): text must be a string');
  }
  const { maxTokens, overlap = 0, boundary = 'none', countTokens } = options;

  if (!isPositiveInteger(maxTokens)) {
    throw new RangeError('chunk: maxTokens must be a positive integer');
  }
  if (!isNonNegativeInteger(overlap)) {
    throw new RangeError('chunk: overlap must be a non-negative integer');
  }
  if (overlap >= maxTokens) {
    throw new RangeError('chunk: overlap must be strictly less than maxTokens');
  }
  if (countTokens === undefined || countTokens === null) {
    throw new TypeError('chunk: a countTokens function or LlmService is required');
  }

  const count = resolveCounter(countTokens);

  if (text.length === 0) {
    return [];
  }

  // Reserve room for the prepended overlap so a chunk's (overlap + new content)
  // never breaches the budget. With `overlap > 0`, new content is packed up to
  // `contentBudget`; the overlap tail then fits within the remaining headroom.
  const contentBudget = maxTokens - overlap;

  // 1. Break the input into atomic semantic segments per the boundary strategy.
  const rawSegments = segment(text, boundary);

  // 2. Ensure no atomic segment exceeds the content budget; force-split those
  //    that do (guarantees overlap can always be added without breaching).
  const units: Segment[] = [];
  for (const seg of rawSegments) {
    if (count(text.slice(seg.start, seg.end)) <= contentBudget) {
      units.push(seg);
    } else {
      units.push(...hardSplit(text, seg.start, seg.end, contentBudget, count));
    }
  }

  // 3. Greedily pack consecutive units into chunks under the budget, then
  //    prepend overlap from the previous chunk's tail.
  const chunks: Chunk[] = [];
  let i = 0;
  let prevEnd = -1; // end offset of the previously emitted chunk's *new* content
  let consumedStart = 0; // start of content already fully emitted (overlap floor)

  while (i < units.length) {
    const contentStart = units[i].start;
    let contentEnd = units[i].end;
    i++;

    // Pack as many further units as fit within the content budget.
    while (i < units.length) {
      const candidateEnd = units[i].end;
      if (count(text.slice(contentStart, candidateEnd)) <= contentBudget) {
        contentEnd = candidateEnd;
        i++;
      } else {
        break;
      }
    }

    // Determine overlap-extended start (only for chunks after the first).
    let start = contentStart;
    if (overlap > 0 && prevEnd >= 0) {
      const oStart = overlapStart(text, contentStart, consumedStart, overlap, maxTokens, count);
      // Only accept overlap if the *combined* slice still fits the budget.
      if (oStart < contentStart && count(text.slice(oStart, contentEnd)) <= maxTokens) {
        start = oStart;
      }
    }

    const slice = text.slice(start, contentEnd);
    chunks.push({
      index: chunks.length,
      text: slice,
      tokenCount: count(slice),
      sourceRange: { start, end: contentEnd },
    });

    consumedStart = contentStart;
    prevEnd = contentEnd;
  }

  return chunks;
}
