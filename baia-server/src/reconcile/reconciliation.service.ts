import {
  BusinessRule,
  GherkinDoc,
  GherkinFeature,
  GherkinScenario,
  GherkinStep,
} from '@baia/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { LLM_SERVICE } from '../llm/llm.constants';
import { LlmError, LlmService } from '../llm/llm.service';
import {
  CodeRule,
  EnrichedScenario,
  ObservedScenario,
  ReconciliationInput,
  ReconciliationOutput,
  RECONCILIATION_OUTPUT_SCHEMA,
  RuleGap,
  renderReconciliationPrompt,
} from '../llm/prompts/reconciliation.prompt';

const MAX_RETRIES = 3;

const VALID_KEYWORDS = new Set<string>(['Given', 'When', 'Then', 'And', 'But']);

export class ReconciliationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ReconciliationError';
    Object.setPrototypeOf(this, ReconciliationError.prototype);
  }
}

function toKeyword(kw: string): GherkinStep['keyword'] {
  return VALID_KEYWORDS.has(kw) ? (kw as GherkinStep['keyword']) : 'When';
}

function mapEnrichedScenario(scenario: EnrichedScenario): GherkinScenario {
  const result: GherkinScenario = {
    name: scenario.title,
    steps: scenario.steps.map(
      (step): GherkinStep => ({
        keyword: toKeyword(step.keyword),
        text: step.text,
        provenance: step.supportedBy && step.supportedBy.length > 0 ? 'merged' : 'ui',
      })
    ),
  };
  if (scenario.status === 'conflict') {
    result.conflictNote = scenario.rationale;
  }
  return result;
}

function mapGapToScenario(gap: RuleGap): GherkinScenario {
  return {
    name: `Code Rule: ${gap.ruleId}`,
    steps: [
      {
        keyword: 'Given',
        text: `the system enforces: ${gap.statement}`,
        provenance: 'code',
      },
      {
        keyword: 'When',
        text: 'the user performs the related action',
        provenance: 'code',
      },
      {
        keyword: 'Then',
        text: gap.suggestedStep,
        provenance: 'code',
      },
    ],
  };
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(@Inject(LLM_SERVICE) private readonly llm: LlmService) {}

  /**
   * Cross-reference Phase-1 Gherkin with Phase-2 rules.
   *
   * Enrich UI steps with code rules (provenance → 'merged'), flag conflicts,
   * and add code-only rules as new scenarios (provenance → 'code'). UI-only
   * steps are kept with their original 'ui' provenance.
   *
   * Retries up to {@link MAX_RETRIES} times on SCHEMA_VALIDATION errors;
   * throws {@link ReconciliationError} on non-retryable errors or exhaustion.
   */
  async reconcile(gherkinDoc: GherkinDoc, rules: BusinessRule[]): Promise<GherkinDoc> {
    if (rules.length === 0) {
      this.logger.log('Reconciliation skipped — no business rules; returning original GherkinDoc');
      return { ...gherkinDoc, generatedAt: new Date() };
    }

    const featureName = gherkinDoc.features[0]?.name ?? 'Feature';

    const observedScenarios: ObservedScenario[] = gherkinDoc.features.flatMap((feature) =>
      feature.scenarios.map(
        (s): ObservedScenario => ({
          title: s.name,
          steps: s.steps.map((step) => ({ keyword: step.keyword, text: step.text })),
        })
      )
    );

    const codeRules: CodeRule[] = rules.map(
      (r): CodeRule => ({
        ruleId: r.id,
        statement: r.description,
        severity: 'medium',
        category: r.category,
      })
    );

    const input: ReconciliationInput = { featureName, observedScenarios, codeRules };
    const prompt = renderReconciliationPrompt(input);
    let lastError: unknown;

    this.logger.log(
      `Reconciliation LLM call: ${observedScenarios.length} scenario(s) × ${codeRules.length} rule(s)`
    );

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          this.logger.warn(`Reconciliation retry attempt ${attempt + 1}/${MAX_RETRIES}`);
        }
        const output = await this.llm.completeJson<ReconciliationOutput>(
          prompt,
          RECONCILIATION_OUTPUT_SCHEMA
        );
        const doc = this.buildDoc(output, featureName);
        this.logger.log(
          `Reconciliation succeeded on attempt ${attempt + 1}: ${output.scenarios.length} enriched scenario(s), ${output.gaps.length} gap(s)`
        );
        return doc;
      } catch (err) {
        lastError = err;
        const isRetryable = err instanceof LlmError && err.code === 'SCHEMA_VALIDATION';
        if (!isRetryable) {
          this.logger.error(
            `Reconciliation non-retryable error: ${err instanceof Error ? err.message : String(err)}`
          );
          throw new ReconciliationError(
            `Reconciliation failed: ${err instanceof Error ? err.message : String(err)}`,
            err
          );
        }
        this.logger.warn(
          `Reconciliation schema validation failed (attempt ${attempt + 1}): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    this.logger.error(`Reconciliation exhausted ${MAX_RETRIES} retries`);
    throw new ReconciliationError(
      `Reconciliation failed after ${MAX_RETRIES} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
      lastError
    );
  }

  private buildDoc(output: ReconciliationOutput, featureName: string): GherkinDoc {
    const enrichedScenarios = output.scenarios.map(mapEnrichedScenario);
    const gapScenarios = output.gaps.map(mapGapToScenario);

    const feature: GherkinFeature = {
      name: featureName,
      scenarios: [...enrichedScenarios, ...gapScenarios],
    };

    return {
      features: [feature],
      generatedAt: new Date(),
    };
  }
}
