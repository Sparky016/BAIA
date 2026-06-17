/**
 * Gherkin-generation prompt template (S2-03).
 *
 * Converts a set of captured UI observations (page states, actions, assertions)
 * into well-formed Gherkin/BDD scenarios following Given-When-Then conventions.
 *
 * Output schema is compatible with {@link LlmService.completeJson}.
 */

import { JsonSchema, ObjectSchema } from '../llm.service';

// ─── Input type ─────────────────────────────────────────────────────────────────

/** A single UI observation captured during a Playwright exploration session. */
export interface UiObservation {
  /** Human-readable description of the observed state or action. */
  readonly description: string;
  /** URL at the time of the observation. */
  readonly url: string;
  /** Optional HTML/text excerpt of the relevant page element. */
  readonly element?: string;
  /** Outcome recorded (e.g. "page navigated", "field cleared", "error shown"). */
  readonly outcome?: string;
}

/** Inputs required to render the Gherkin-generation prompt. */
export interface GherkinGenerationInput {
  /** Human-readable name of the feature being described. */
  readonly featureName: string;
  /** Ordered sequence of UI observations to translate into Gherkin. */
  readonly observations: readonly UiObservation[];
  /** Optional user-facing goal / acceptance criterion. */
  readonly acceptanceCriteria?: string;
}

// ─── Output type ────────────────────────────────────────────────────────────────

/** A single Gherkin step (Given / When / Then / And / But). */
export interface GherkinStep {
  /** BDD keyword. */
  readonly keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
  /** Step text (without the keyword). */
  readonly text: string;
}

/** A complete Gherkin scenario. */
export interface GherkinScenario {
  /** Short, imperative scenario title. */
  readonly title: string;
  /** Ordered list of steps. */
  readonly steps: readonly GherkinStep[];
  /** Optional tags (e.g. "@smoke", "@regression"). */
  readonly tags?: readonly string[];
}

/** Structured output shape returned by the Gherkin-generation LLM call. */
export interface GherkinGenerationOutput {
  /** The feature name as interpreted by the model. */
  readonly featureName: string;
  /** Optional feature-level description. */
  readonly featureDescription?: string;
  /** One or more scenarios generated from the observations. */
  readonly scenarios: readonly GherkinScenario[];
}

// ─── Template metadata ──────────────────────────────────────────────────────────

export const GHERKIN_GENERATION_TEMPLATE_ID = 'gherkin-generation' as const;
export const GHERKIN_GENERATION_TEMPLATE_VERSION = '1.0.0' as const;

// ─── Output schema ──────────────────────────────────────────────────────────────

/** Runtime JSON schema for {@link GherkinGenerationOutput}, for use with `completeJson`. */
export const GHERKIN_GENERATION_OUTPUT_SCHEMA: ObjectSchema = {
  type: 'object',
  properties: {
    featureName: { type: 'string' },
    featureDescription: { type: 'string' },
    scenarios: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                keyword: {
                  type: 'string',
                  enum: ['Given', 'When', 'Then', 'And', 'But'],
                },
                text: { type: 'string' },
              },
              required: ['keyword', 'text'],
              additionalProperties: false,
            },
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['title', 'steps'],
        additionalProperties: false,
      },
    },
  },
  required: ['featureName', 'scenarios'],
  additionalProperties: false,
} satisfies JsonSchema;

// ─── Render function ─────────────────────────────────────────────────────────────

/**
 * Render the Gherkin-generation prompt string from typed inputs.
 *
 * Enforces Gherkin/BDD formatting rules (Given/When/Then) in its instructions.
 *
 * @param input Typed inputs for this Gherkin generation request.
 * @returns A prompt string ready to pass to {@link LlmService.completeJson}.
 */
export function renderGherkinGenerationPrompt(input: GherkinGenerationInput): string {
  const { featureName, observations, acceptanceCriteria } = input;

  const observationsList = observations
    .map((obs, i) => {
      const lines = [`${i + 1}. ${obs.description}`, `   URL: ${obs.url}`];
      if (obs.element) lines.push(`   Element: ${obs.element}`);
      if (obs.outcome) lines.push(`   Outcome: ${obs.outcome}`);
      return lines.join('\n');
    })
    .join('\n');

  const criteriaSection = acceptanceCriteria
    ? `## Acceptance criteria\n${acceptanceCriteria}\n\n`
    : '';

  return `You are a Business Analyst writing Gherkin/BDD specifications. Convert the UI \
observations below into one or more Gherkin scenarios for the feature "${featureName}".

${criteriaSection}## UI observations
${observationsList}

## Strict Gherkin/BDD formatting rules — MUST be followed exactly
1. Every scenario MUST start its first context step with the keyword "Given".
2. Every scenario MUST contain at least one "When" step describing a user action.
3. Every scenario MUST contain at least one "Then" step describing the expected outcome.
4. Use "And" to continue a sequence of the same keyword type (not as the first step).
5. Use "But" only for negative continuations within a Then block.
6. Step text MUST be written in plain English, present tense, third-person or second-person \
perspective — no programming terms, selectors, or HTML.
7. Scenario titles MUST be short, imperative, and unique within the feature.
8. Tags are optional; if included they MUST begin with "@" (e.g. "@smoke", "@regression").
9. Do NOT invent steps not evidenced by the observations.
10. One scenario per distinct user journey or outcome variation.

## Output format
Respond ONLY with a JSON object — no markdown fences, no prose:

{
  "featureName": "<name>",
  "featureDescription": "<optional one-sentence description>",
  "scenarios": [
    {
      "title": "<imperative title>",
      "tags": ["@tag"],
      "steps": [
        { "keyword": "Given", "text": "<context>" },
        { "keyword": "When",  "text": "<action>" },
        { "keyword": "Then",  "text": "<outcome>" }
      ]
    }
  ]
}`;
}
