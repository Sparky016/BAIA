/**
 * Prompt template registry (S2-03).
 *
 * Centralises every versioned BAIA prompt template and exposes them via a
 * typed registry keyed by template id. Consumers look up a template, pass
 * typed inputs to its render function, and supply its schema to
 * {@link LlmService.completeJson}.
 *
 * ## Usage
 * ```ts
 * import { promptRegistry } from '@/llm/prompts';
 *
 * const tpl = promptRegistry['action-planning'];
 * const prompt = tpl.render({ instruction, currentUrl, domSnapshot });
 * const result = await llm.completeJson<ActionPlanningOutput>(prompt, tpl.schema);
 * ```
 */

import { JsonSchema } from '../llm.service';

import {
  ACTION_PLANNING_OUTPUT_SCHEMA,
  ACTION_PLANNING_TEMPLATE_ID,
  ACTION_PLANNING_TEMPLATE_VERSION,
  ActionPlanningInput,
  ActionPlanningOutput,
  renderActionPlanningPrompt,
} from './action-planning.prompt';
import {
  GHERKIN_GENERATION_OUTPUT_SCHEMA,
  GHERKIN_GENERATION_TEMPLATE_ID,
  GHERKIN_GENERATION_TEMPLATE_VERSION,
  GherkinGenerationInput,
  GherkinGenerationOutput,
  renderGherkinGenerationPrompt,
} from './gherkin-generation.prompt';
import {
  RECONCILIATION_OUTPUT_SCHEMA,
  RECONCILIATION_TEMPLATE_ID,
  RECONCILIATION_TEMPLATE_VERSION,
  ReconciliationInput,
  ReconciliationOutput,
  renderReconciliationPrompt,
} from './reconciliation.prompt';
import {
  RULE_EXTRACTION_OUTPUT_SCHEMA,
  RULE_EXTRACTION_TEMPLATE_ID,
  RULE_EXTRACTION_TEMPLATE_VERSION,
  RuleExtractionInput,
  RuleExtractionOutput,
  renderRuleExtractionPrompt,
} from './rule-extraction.prompt';

// ─── Generic template descriptor ────────────────────────────────────────────────

/**
 * A versioned, typed prompt template.
 *
 * @typeParam TInput   The typed input consumed by the render function.
 * @typeParam _TOutput The typed output produced by the LLM (matched by `schema`).
 *                     Unused in the interface body; kept as a phantom type so the
 *                     registry entries are typed end-to-end at the call site.
 */
export interface PromptTemplate<TInput, _TOutput> {
  /** Stable kebab-case identifier. */
  readonly id: string;
  /** SemVer string; bump on any breaking change to the prompt text or schema. */
  readonly version: string;
  /** Runtime JSON schema for the output type; pass directly to `completeJson`. */
  readonly schema: JsonSchema;
  /**
   * Produce the prompt string from typed inputs.
   *
   * @param input Typed inputs specific to this template.
   * @returns A prompt string ready to pass to {@link LlmService.completeJson}.
   */
  render(input: TInput): string;
}

// ─── Concrete template entries ───────────────────────────────────────────────────

const actionPlanningTemplate: PromptTemplate<ActionPlanningInput, ActionPlanningOutput> = {
  id: ACTION_PLANNING_TEMPLATE_ID,
  version: ACTION_PLANNING_TEMPLATE_VERSION,
  schema: ACTION_PLANNING_OUTPUT_SCHEMA,
  render: renderActionPlanningPrompt,
};

const gherkinGenerationTemplate: PromptTemplate<GherkinGenerationInput, GherkinGenerationOutput> = {
  id: GHERKIN_GENERATION_TEMPLATE_ID,
  version: GHERKIN_GENERATION_TEMPLATE_VERSION,
  schema: GHERKIN_GENERATION_OUTPUT_SCHEMA,
  render: renderGherkinGenerationPrompt,
};

const ruleExtractionTemplate: PromptTemplate<RuleExtractionInput, RuleExtractionOutput> = {
  id: RULE_EXTRACTION_TEMPLATE_ID,
  version: RULE_EXTRACTION_TEMPLATE_VERSION,
  schema: RULE_EXTRACTION_OUTPUT_SCHEMA,
  render: renderRuleExtractionPrompt,
};

const reconciliationTemplate: PromptTemplate<ReconciliationInput, ReconciliationOutput> = {
  id: RECONCILIATION_TEMPLATE_ID,
  version: RECONCILIATION_TEMPLATE_VERSION,
  schema: RECONCILIATION_OUTPUT_SCHEMA,
  render: renderReconciliationPrompt,
};

// ─── Registry ────────────────────────────────────────────────────────────────────

/**
 * The full BAIA prompt template registry, keyed by template id.
 *
 * New templates MUST be added here. Consumers SHOULD access templates via this
 * object rather than importing prompt files directly — this ensures all
 * templates are versioned and discoverable in one place.
 */
export const promptRegistry = {
  [ACTION_PLANNING_TEMPLATE_ID]: actionPlanningTemplate,
  [GHERKIN_GENERATION_TEMPLATE_ID]: gherkinGenerationTemplate,
  [RULE_EXTRACTION_TEMPLATE_ID]: ruleExtractionTemplate,
  [RECONCILIATION_TEMPLATE_ID]: reconciliationTemplate,
} as const;

/** Union of all valid template ids. */
export type PromptTemplateId = keyof typeof promptRegistry;

// ─── Re-exports for convenience ──────────────────────────────────────────────────

export type { ActionPlanningInput, ActionPlanningOutput } from './action-planning.prompt';
export { ACTION_PLANNING_OUTPUT_SCHEMA } from './action-planning.prompt';

export type {
  GherkinGenerationInput,
  GherkinGenerationOutput,
  GherkinScenario,
  GherkinStep,
  UiObservation,
} from './gherkin-generation.prompt';
export { GHERKIN_GENERATION_OUTPUT_SCHEMA } from './gherkin-generation.prompt';

export type {
  ExtractedRule,
  RuleExtractionInput,
  RuleExtractionOutput,
  RuleSeverity,
} from './rule-extraction.prompt';
export { RULE_EXTRACTION_OUTPUT_SCHEMA } from './rule-extraction.prompt';

export type {
  CodeRule,
  EnrichedScenario,
  EnrichedStep,
  ObservedScenario,
  ReconciliationInput,
  ReconciliationOutput,
  ReconciliationStatus,
  RuleConflict,
  RuleGap,
} from './reconciliation.prompt';
export { RECONCILIATION_OUTPUT_SCHEMA } from './reconciliation.prompt';
