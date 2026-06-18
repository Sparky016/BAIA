/**
 * Gherkin generator service (S3-05).
 *
 * Translates an {@link ExploreTrace} captured during a Playwright crawl into a
 * validated {@link GherkinDoc} by:
 *   1. Mapping {@link CapturedStep}s to {@link UiObservation}s.
 *   2. Calling the LLM with the rendered Gherkin-generation prompt.
 *   3. Mapping the {@link GherkinGenerationOutput} to a {@link GherkinDoc},
 *      stamping every step with `provenance: 'ui'`.
 *   4. Validating the result via {@link validateGherkinDoc}.
 *
 * On {@link LlmError} with code `SCHEMA_VALIDATION`, or on
 * {@link GherkinValidationError}, the service retries up to {@link MAX_RETRIES}
 * times before throwing a {@link GherkinGenerationError}.
 */

import { Inject, Injectable } from '@nestjs/common';
import { GherkinDoc, GherkinFeature, GherkinScenario, GherkinStep } from '@baia/shared';

import { CapturedStep, ExploreTrace } from '../explore/crawl-capture.service';
import { LLM_SERVICE } from '../llm/llm.constants';
import { LlmError, LlmService } from '../llm/llm.service';
import {
  GherkinGenerationOutput,
  GHERKIN_GENERATION_OUTPUT_SCHEMA,
  renderGherkinGenerationPrompt,
  UiObservation,
} from '../llm/prompts/gherkin-generation.prompt';
import { GherkinValidationError, validateGherkinDoc } from './gherkin-validator';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;

// ─── Error ────────────────────────────────────────────────────────────────────

export class GherkinGenerationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'GherkinGenerationError';
    // Restore prototype chain (TS target ES2021 / extending built-ins).
    Object.setPrototypeOf(this, GherkinGenerationError.prototype);
  }
}

// ─── Mapper helpers ───────────────────────────────────────────────────────────

function capturedStepToUiObservation(step: CapturedStep): UiObservation {
  return {
    description: step.observation,
    url: step.url,
  };
}

function outputToGherkinDoc(output: GherkinGenerationOutput): GherkinDoc {
  const feature: GherkinFeature = {
    name: output.featureName,
    ...(output.featureDescription ? { description: output.featureDescription } : {}),
    scenarios: output.scenarios.map(
      (scenario): GherkinScenario => ({
        name: scenario.title,
        steps: scenario.steps.map(
          (step): GherkinStep => ({
            keyword: step.keyword,
            text: step.text,
            provenance: 'ui',
          })
        ),
      })
    ),
  };

  return {
    features: [feature],
    generatedAt: new Date(),
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class GherkinGeneratorService {
  constructor(@Inject(LLM_SERVICE) private readonly llm: LlmService) {}

  /**
   * Generate a validated {@link GherkinDoc} from an {@link ExploreTrace}.
   *
   * Retries up to {@link MAX_RETRIES} times on `SCHEMA_VALIDATION` LLM errors
   * and on {@link GherkinValidationError}. Throws a {@link GherkinGenerationError}
   * after exhausting all retries.
   */
  async generateGherkin(trace: ExploreTrace): Promise<GherkinDoc> {
    const observations = trace.steps.map(capturedStepToUiObservation);
    const featureName = `Run ${trace.runId}`;

    const prompt = renderGherkinGenerationPrompt({ featureName, observations });

    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const output = await this.llm.completeJson<GherkinGenerationOutput>(
          prompt,
          GHERKIN_GENERATION_OUTPUT_SCHEMA
        );

        const doc = outputToGherkinDoc(output);
        validateGherkinDoc(doc);

        return doc;
      } catch (err) {
        lastError = err;

        const isRetryable =
          (err instanceof LlmError && err.code === 'SCHEMA_VALIDATION') ||
          err instanceof GherkinValidationError;

        if (!isRetryable) {
          throw new GherkinGenerationError(
            `Gherkin generation failed: ${err instanceof Error ? err.message : String(err)}`,
            err
          );
        }
        // Retryable — continue to next attempt.
      }
    }

    throw new GherkinGenerationError(
      `Gherkin generation failed after ${MAX_RETRIES} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      lastError
    );
  }
}
