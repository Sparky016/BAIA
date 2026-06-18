/**
 * Gherkin BDD structure validator (S3-05).
 *
 * Validates a {@link GherkinDoc} against the canonical Given→When→Then ordering
 * rules. Throws a {@link GherkinValidationError} with a descriptive message on
 * any violation so callers get actionable feedback without inspecting internal
 * state.
 */

import { GherkinDoc, GherkinStep } from '@baia/shared';

// ─── Error ────────────────────────────────────────────────────────────────────

export class GherkinValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GherkinValidationError';
    // Restore prototype chain (TS target ES2021 / extending built-ins).
    Object.setPrototypeOf(this, GherkinValidationError.prototype);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * The three canonical BDD phases, in order.
 * 'And'/'But' inherit the phase of the step they continue.
 */
type Phase = 'Given' | 'When' | 'Then';

/**
 * Resolve the effective phase for a step, given the phase that was active
 * before this step.
 *
 * Returns `null` when the transition is invalid (e.g. Then followed by When).
 */
function resolvePhase(
  keyword: GherkinStep['keyword'],
  currentPhase: Phase | null
): Phase | null {
  switch (keyword) {
    case 'Given':
      // Given may only appear before any When has started.
      if (currentPhase === 'When' || currentPhase === 'Then') {
        return null; // invalid — Given after When/Then
      }
      return 'Given';

    case 'When':
      // When may follow Given (or another When) but not Then.
      if (currentPhase === 'Then') {
        return null; // invalid — When after Then
      }
      return 'When';

    case 'Then':
      // Then must follow When (or another Then).
      if (currentPhase !== 'When' && currentPhase !== 'Then') {
        return null; // invalid — Then before When
      }
      return 'Then';

    case 'And':
    case 'But':
      // Continuation: inherits the current phase, which must already exist.
      return currentPhase; // null if no prior step (also invalid, caught below)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate `doc` against all BDD structural rules.
 *
 * Rules enforced:
 * 1. At least one feature.
 * 2. Every feature has at least one scenario.
 * 3. Every scenario has at least one explicit `Given` step.
 * 4. Every scenario has at least one explicit `When` step.
 * 5. Every scenario has at least one explicit `Then` step.
 * 6. Steps follow the canonical Given* → When+ → Then+ ordering; And/But
 *    continue the most-recent canonical phase and may not appear before any
 *    canonical keyword.
 *
 * @throws {GherkinValidationError} on the first detected violation.
 */
export function validateGherkinDoc(doc: GherkinDoc): void {
  if (doc.features.length === 0) {
    throw new GherkinValidationError('GherkinDoc must have at least one feature');
  }

  for (const feature of doc.features) {
    const featureLabel = `Feature "${feature.name}"`;

    if (feature.scenarios.length === 0) {
      throw new GherkinValidationError(`${featureLabel} must have at least one scenario`);
    }

    for (const scenario of feature.scenarios) {
      const scenarioLabel = `${featureLabel} > Scenario "${scenario.name}"`;

      if (scenario.steps.length === 0) {
        throw new GherkinValidationError(`${scenarioLabel} must have at least one step`);
      }

      // Check for presence of each canonical keyword (And/But don't count).
      const hasGiven = scenario.steps.some((s) => s.keyword === 'Given');
      const hasWhen = scenario.steps.some((s) => s.keyword === 'When');
      const hasThen = scenario.steps.some((s) => s.keyword === 'Then');

      if (!hasGiven) {
        throw new GherkinValidationError(
          `${scenarioLabel} must have at least one "Given" step`
        );
      }
      if (!hasWhen) {
        throw new GherkinValidationError(
          `${scenarioLabel} must have at least one "When" step`
        );
      }
      if (!hasThen) {
        throw new GherkinValidationError(
          `${scenarioLabel} must have at least one "Then" step`
        );
      }

      // Validate ordering via phase-transition rules.
      let phase: Phase | null = null;
      for (const step of scenario.steps) {
        if ((step.keyword === 'And' || step.keyword === 'But') && phase === null) {
          throw new GherkinValidationError(
            `${scenarioLabel}: "${step.keyword}" step cannot appear before a canonical keyword`
          );
        }
        const next = resolvePhase(step.keyword, phase);
        if (next === null) {
          throw new GherkinValidationError(
            `${scenarioLabel}: invalid step ordering — "${step.keyword}" step after "${phase ?? 'nothing'}"`
          );
        }
        phase = next;
      }
    }
  }
}
