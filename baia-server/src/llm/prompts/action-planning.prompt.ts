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

// ─── Step-by-step planning types ────────────────────────────────────────────────

/** Input for single-step planning (one action at a time with optional vision). */
export interface StepPlannerInput {
  /** Natural-language goal the agent is working toward. */
  readonly instruction: string;
  /** Current page URL. */
  readonly currentUrl: string;
  /** Simplified DOM snapshot of the current page. */
  readonly domSnapshot: string;
  /** Optional base-64 PNG screenshot for visual analysis. */
  readonly screenshotBase64?: string;
  /** Human-readable descriptions of previously executed actions. */
  readonly previousActions?: readonly string[];
}

/** Structured output for a single planning step. */
export interface StepPlannerOutput {
  /** What the model observes on the current page. */
  readonly pageDescription: string;
  /** The single next action to execute, or null when the goal is complete. */
  readonly nextAction: PlannedAction | null;
  /** True when the goal has been achieved and no further actions are needed. */
  readonly goalReached: boolean;
}

/** Runtime JSON schema for {@link StepPlannerOutput}. */
export const STEP_PLANNER_OUTPUT_SCHEMA: ObjectSchema = {
  type: 'object',
  properties: {
    pageDescription: { type: 'string' },
    nextAction: {
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
    goalReached: { type: 'boolean' },
  },
  required: ['pageDescription', 'goalReached'],
  additionalProperties: false,
} satisfies JsonSchema;

/**
 * Render the step-by-step planning prompt.
 *
 * When a screenshot is provided it should be sent alongside this prompt via
 * `LlmService.completeWithVision`. When no screenshot is available pass this
 * prompt to the standard `completeJson`.
 */
export function renderStepPlannerPrompt(input: StepPlannerInput): string {
  const { instruction, currentUrl, domSnapshot, screenshotBase64, previousActions = [] } = input;

  const previousActionsSection =
    previousActions.length > 0
      ? `## Actions already taken\n${previousActions.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n`
      : '';

  const screenshotNote = screenshotBase64
    ? 'A screenshot of the current page is provided as the image above. Use it to visually identify form fields, buttons, and page state.'
    : 'No screenshot is available — analyse the DOM only.';

  return `You are a web automation agent completing a goal one step at a time.

At each step you will:
1. Describe what you see on the current page
2. Decide the single best next action to take toward the goal
3. Signal when the goal is fully achieved

## Goal
${instruction}

## Current URL
${currentUrl}

${previousActionsSection}## Current page DOM
\`\`\`html
${domSnapshot}
\`\`\`

${screenshotNote}

## Selector strategy (preferred order)
1. ID attribute — #fieldId or input[id="fieldId"]
2. Name attribute — input[name="fieldName"]
3. ARIA label — [aria-label="Label text"]
4. Placeholder text — input[placeholder="Enter your name"]
5. Data test ID — [data-testid="submit-btn"]
6. Button/link text — button:has-text("Start Quote") or a:has-text("Get a Quote")
7. Label association — label:has-text("First Name") + input
AVOID fragile position selectors like div:nth-child(2) > span > input.

## Rules
- If the goal is already complete based on the current page state and actions taken, set goalReached=true and omit nextAction.
- Otherwise return exactly ONE action in nextAction.
- The "value" field is required for fill and select actions; omit it for all others.
- Use the actual data values specified in the instruction (names, ID numbers, etc).
- pageDescription must concisely describe the current visible page state.

Respond with a JSON object matching this exact schema:
{
  "pageDescription": "<what you see on the current page>",
  "nextAction": { "action": "<verb>", "selector": "<css or text selector>", "value": "<optional>", "reason": "<why this action>" },
  "goalReached": false
}
If the goal is complete:
{
  "pageDescription": "<what you see>",
  "goalReached": true
}`;
}

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
