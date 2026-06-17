/**
 * Action-planning prompt template (S2-03).
 *
 * Converts a natural-language instruction + current page context into a
 * structured list of Playwright actions the explore module will execute.
 *
 * Output schema is compatible with {@link LlmService.completeJson}.
 */

import { JsonSchema, ObjectSchema } from '../llm.service';

// ─── Input type ────────────────────────────────────────────────────────────────

/** Inputs required to render the action-planning prompt. */
export interface ActionPlanningInput {
  /** Natural-language instruction supplied by the user (e.g. "click Login"). */
  readonly instruction: string;
  /** Current page URL the Playwright runner is on. */
  readonly currentUrl: string;
  /** Simplified DOM snapshot of the current page (text/html excerpt). */
  readonly domSnapshot: string;
  /** Optional list of previous actions already taken in this session. */
  readonly previousActions?: readonly string[];
}

// ─── Output type ────────────────────────────────────────────────────────────────

/** A single planned Playwright action returned by the LLM. */
export interface PlannedAction {
  /** Action verb matching the BAIA action vocabulary (e.g. "click", "type"). */
  readonly action: string;
  /** CSS/text selector or target description. */
  readonly selector: string;
  /** Optional value for fill/type actions. */
  readonly value?: string;
  /** Human-readable rationale for this step. */
  readonly reason: string;
}

/** Structured output shape returned by the action-planning LLM call. */
export interface ActionPlanningOutput {
  /** Ordered list of actions to execute. */
  readonly actions: readonly PlannedAction[];
  /** Overall goal interpretation of the instruction. */
  readonly goalSummary: string;
}

// ─── Template metadata ──────────────────────────────────────────────────────────

/** Versioned template identity. */
export const ACTION_PLANNING_TEMPLATE_ID = 'action-planning' as const;
export const ACTION_PLANNING_TEMPLATE_VERSION = '1.0.0' as const;

// ─── Output schema ──────────────────────────────────────────────────────────────

/** Runtime JSON schema for {@link ActionPlanningOutput}, for use with `completeJson`. */
export const ACTION_PLANNING_OUTPUT_SCHEMA: ObjectSchema = {
  type: 'object',
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          selector: { type: 'string' },
          value: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['action', 'selector', 'reason'],
        additionalProperties: false,
      },
    },
    goalSummary: { type: 'string' },
  },
  required: ['actions', 'goalSummary'],
  additionalProperties: false,
} satisfies JsonSchema;

// ─── Render function ─────────────────────────────────────────────────────────────

/**
 * Render the action-planning prompt string from typed inputs.
 *
 * @param input Typed inputs for this planning request.
 * @returns A prompt string ready to pass to {@link LlmService.completeJson}.
 */
export function renderActionPlanningPrompt(input: ActionPlanningInput): string {
  const { instruction, currentUrl, domSnapshot, previousActions = [] } = input;

  const previousActionsSection =
    previousActions.length > 0
      ? `## Previously executed actions\n${previousActions.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n`
      : '';

  return `You are a Playwright automation planner. Given a natural-language instruction, \
the current page context, and optionally a history of previous actions, you MUST produce \
a JSON object describing the exact Playwright actions to execute next.

## Instruction
${instruction}

## Current URL
${currentUrl}

${previousActionsSection}## Current page DOM snapshot
\`\`\`html
${domSnapshot}
\`\`\`

## Rules
- Use ONLY these action verbs: click, type, fill, select, navigate, hover, press, wait, assert.
- The "selector" field must be a valid CSS selector or a descriptive text selector.
- The "value" field is required for fill/type/select actions; omit it otherwise.
- The "reason" field must briefly justify why this action fulfils the instruction.
- Produce the MINIMUM set of actions required; do not add unnecessary steps.
- Respond ONLY with a JSON object matching this exact schema — no markdown fences, \
no prose outside the JSON:

{
  "actions": [
    { "action": "<verb>", "selector": "<css or text>", "value": "<optional>", "reason": "<why>" }
  ],
  "goalSummary": "<one-sentence interpretation of the user instruction>"
}`;
}
