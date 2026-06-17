/**
 * Rule-extraction prompt template (S2-03).
 *
 * Analyses a source-code chunk (controller, service, repository, etc.) and
 * extracts structured business rules that can later be reconciled with Gherkin
 * observations from the UI exploration phase.
 *
 * Output schema is compatible with {@link LlmService.completeJson}.
 */

import { JsonSchema, ObjectSchema } from '../llm.service';

// ─── Input type ─────────────────────────────────────────────────────────────────

/** Inputs required to render the rule-extraction prompt. */
export interface RuleExtractionInput {
  /** Language/framework of the code chunk (e.g. "C# ASP.NET MVC", "TypeScript NestJS"). */
  readonly language: string;
  /** The source-code chunk to analyse. */
  readonly codeChunk: string;
  /** Optional file path or module name for context. */
  readonly filePath?: string;
  /** Optional high-level description of what this module is responsible for. */
  readonly moduleDescription?: string;
}

// ─── Output type ────────────────────────────────────────────────────────────────

/** Severity / certainty of an extracted rule. */
export type RuleSeverity = 'must' | 'should' | 'may';

/** A single extracted business rule. */
export interface ExtractedRule {
  /** Short, unique identifier for this rule (e.g. "auth-redirect-unauthenticated"). */
  readonly ruleId: string;
  /** Human-readable rule statement in business language (no code terms). */
  readonly statement: string;
  /** Certainty level inferred from the code. */
  readonly severity: RuleSeverity;
  /** Code line reference or snippet that evidences the rule. */
  readonly evidence: string;
  /** Optional category / domain (e.g. "authentication", "validation", "navigation"). */
  readonly category?: string;
}

/** Structured output shape returned by the rule-extraction LLM call. */
export interface RuleExtractionOutput {
  /** Module/file this extraction applies to. */
  readonly module: string;
  /** Extracted business rules. */
  readonly rules: readonly ExtractedRule[];
  /** Brief summary of what this code chunk does in business terms. */
  readonly summary: string;
}

// ─── Template metadata ──────────────────────────────────────────────────────────

export const RULE_EXTRACTION_TEMPLATE_ID = 'rule-extraction' as const;
export const RULE_EXTRACTION_TEMPLATE_VERSION = '1.0.0' as const;

// ─── Output schema ──────────────────────────────────────────────────────────────

/** Runtime JSON schema for {@link RuleExtractionOutput}, for use with `completeJson`. */
export const RULE_EXTRACTION_OUTPUT_SCHEMA: ObjectSchema = {
  type: 'object',
  properties: {
    module: { type: 'string' },
    rules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ruleId: { type: 'string' },
          statement: { type: 'string' },
          severity: { type: 'string', enum: ['must', 'should', 'may'] },
          evidence: { type: 'string' },
          category: { type: 'string' },
        },
        required: ['ruleId', 'statement', 'severity', 'evidence'],
        additionalProperties: false,
      },
    },
    summary: { type: 'string' },
  },
  required: ['module', 'rules', 'summary'],
  additionalProperties: false,
} satisfies JsonSchema;

// ─── Render function ─────────────────────────────────────────────────────────────

/**
 * Render the rule-extraction prompt string from typed inputs.
 *
 * @param input Typed inputs for this extraction request.
 * @returns A prompt string ready to pass to {@link LlmService.completeJson}.
 */
export function renderRuleExtractionPrompt(input: RuleExtractionInput): string {
  const { language, codeChunk, filePath, moduleDescription } = input;

  const filePathLine = filePath ? `**File:** \`${filePath}\`\n` : '';
  const moduleDescLine = moduleDescription ? `**Module description:** ${moduleDescription}\n` : '';

  return `You are a Business Analyst extracting business rules from source code. \
Analyse the ${language} code chunk below and identify every business rule \
(constraint, validation, permission, workflow step, or domain invariant) that \
the code enforces or implies.

${filePathLine}${moduleDescLine}
## Source code (${language})
\`\`\`
${codeChunk}
\`\`\`

## Rules for extraction
- Express each rule as a plain-English business statement — NO code syntax, NO \
method names, NO programming jargon.
- Use "must" for hard constraints enforced unconditionally (e.g. guards, throws, \
validation failures).
- Use "should" for conditional or soft constraints (e.g. redirects with fallbacks, \
optional checks).
- Use "may" for optional/permissive behaviours.
- The "evidence" field must quote the relevant code line or snippet (max 120 chars).
- The "ruleId" must be a kebab-case slug unique within the extracted set.
- The "category" field should classify the domain (e.g. "authentication", \
"validation", "navigation", "data-access", "authorisation") — use existing \
categories before inventing new ones.
- Do NOT include implementation details (e.g. "the code calls X") — only the \
business intent.
- Respond ONLY with a JSON object — no markdown fences, no prose:

{
  "module": "<file/module name>",
  "summary": "<one or two sentence description of what this code does in business terms>",
  "rules": [
    {
      "ruleId": "<kebab-slug>",
      "statement": "<plain English business rule>",
      "severity": "must|should|may",
      "evidence": "<code snippet>",
      "category": "<optional domain category>"
    }
  ]
}`;
}
