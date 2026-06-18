/**
 * Tests for GherkinGeneratorService (S3-05) and GherkinValidationError.
 *
 * LlmService is mocked with jest.fn() — no NestJS DI bootstrap, no real LLM.
 */

import { GherkinDoc } from '@baia/shared';

import { ExploreTrace } from '../explore/crawl-capture.service';
import { LlmError, LlmService } from '../llm/llm.service';
import { GherkinGenerationOutput } from '../llm/prompts/gherkin-generation.prompt';
import { GherkinGenerationError, GherkinGeneratorService } from './gherkin-generator.service';
import { GherkinValidationError, validateGherkinDoc } from './gherkin-validator';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** Minimal valid LLM output. */
const VALID_OUTPUT: GherkinGenerationOutput = {
  featureName: 'Run test-run-1',
  featureDescription: 'A sample feature',
  scenarios: [
    {
      title: 'User logs in successfully',
      steps: [
        { keyword: 'Given', text: 'the user is on the login page' },
        { keyword: 'When', text: 'the user enters valid credentials' },
        { keyword: 'Then', text: 'the user is redirected to the dashboard' },
      ],
    },
  ],
};

/** Two-step trace used for happy-path and mapping tests. */
const SAMPLE_TRACE: ExploreTrace = {
  runId: 'test-run-1',
  steps: [
    {
      stepIndex: 0,
      timestamp: new Date('2024-01-01T00:00:00Z'),
      url: 'https://example.com/login',
      domSnapshot: '<form>…</form>',
      networkEvents: [],
      observation: 'User lands on login page',
    },
    {
      stepIndex: 1,
      timestamp: new Date('2024-01-01T00:00:05Z'),
      url: 'https://example.com/dashboard',
      domSnapshot: '<div>Dashboard</div>',
      networkEvents: [],
      observation: 'User is on dashboard after login',
    },
  ],
  startedAt: new Date('2024-01-01T00:00:00Z'),
};

// ─── Mock factory ─────────────────────────────────────────────────────────────

/**
 * Returns a typed mock LlmService whose `completeJson` resolves / rejects with
 * successive entries from `responses`.
 */
function makeMockLlm(
  responses: Array<GherkinGenerationOutput | LlmError | Error>
): jest.Mocked<Pick<LlmService, 'completeJson' | 'complete' | 'countTokens'>> {
  let callIndex = 0;
  const completeJson = jest.fn().mockImplementation(async () => {
    const entry = responses[callIndex % responses.length];
    callIndex++;
    if (entry instanceof Error) {
      throw entry;
    }
    return entry;
  });
  return {
    complete: jest.fn(),
    completeJson,
    countTokens: jest.fn().mockReturnValue(0),
  };
}

function buildService(
  llm: Pick<LlmService, 'completeJson' | 'complete' | 'countTokens'>
): GherkinGeneratorService {
  return new GherkinGeneratorService(llm as LlmService);
}

function schemaError(): LlmError {
  return new LlmError('SCHEMA_VALIDATION', 'model output failed validation', { raw: '{}' });
}

// ─── validateGherkinDoc (unit) ────────────────────────────────────────────────

describe('validateGherkinDoc', () => {
  function makeDoc(overrides?: Partial<GherkinDoc>): GherkinDoc {
    const base: GherkinDoc = {
      features: [
        {
          name: 'Login',
          scenarios: [
            {
              name: 'Happy path',
              steps: [
                { keyword: 'Given', text: 'I am on the login page', provenance: 'ui' },
                { keyword: 'When', text: 'I enter valid credentials', provenance: 'ui' },
                { keyword: 'Then', text: 'I see the dashboard', provenance: 'ui' },
              ],
            },
          ],
        },
      ],
      generatedAt: new Date(),
    };
    return { ...base, ...overrides };
  }

  it('accepts a fully valid GherkinDoc', () => {
    expect(() => validateGherkinDoc(makeDoc())).not.toThrow();
  });

  it('throws when there are no features', () => {
    expect(() => validateGherkinDoc({ ...makeDoc(), features: [] })).toThrow(
      GherkinValidationError
    );
    expect(() => validateGherkinDoc({ ...makeDoc(), features: [] })).toThrow(
      /at least one feature/
    );
  });

  it('throws when a feature has no scenarios', () => {
    const doc = makeDoc();
    doc.features[0].scenarios = [];
    expect(() => validateGherkinDoc(doc)).toThrow(GherkinValidationError);
    expect(() => validateGherkinDoc(doc)).toThrow(/at least one scenario/);
  });

  it('throws when a scenario has no steps', () => {
    const doc = makeDoc();
    doc.features[0].scenarios[0].steps = [];
    expect(() => validateGherkinDoc(doc)).toThrow(GherkinValidationError);
    expect(() => validateGherkinDoc(doc)).toThrow(/at least one step/);
  });

  it('throws when a scenario is missing a Given step', () => {
    const doc = makeDoc();
    doc.features[0].scenarios[0].steps = [
      { keyword: 'When', text: 'I click submit', provenance: 'ui' },
      { keyword: 'Then', text: 'I see success', provenance: 'ui' },
    ];
    expect(() => validateGherkinDoc(doc)).toThrow(GherkinValidationError);
    expect(() => validateGherkinDoc(doc)).toThrow(/"Given"/);
  });

  it('throws when a scenario is missing a When step', () => {
    const doc = makeDoc();
    doc.features[0].scenarios[0].steps = [
      { keyword: 'Given', text: 'I am on the page', provenance: 'ui' },
      { keyword: 'Then', text: 'I see success', provenance: 'ui' },
    ];
    expect(() => validateGherkinDoc(doc)).toThrow(GherkinValidationError);
    expect(() => validateGherkinDoc(doc)).toThrow(/"When"/);
  });

  it('throws when a scenario is missing a Then step', () => {
    const doc = makeDoc();
    doc.features[0].scenarios[0].steps = [
      { keyword: 'Given', text: 'I am on the page', provenance: 'ui' },
      { keyword: 'When', text: 'I click submit', provenance: 'ui' },
    ];
    expect(() => validateGherkinDoc(doc)).toThrow(GherkinValidationError);
    expect(() => validateGherkinDoc(doc)).toThrow(/"Then"/);
  });

  it('throws when Then appears before When (wrong order)', () => {
    const doc = makeDoc();
    doc.features[0].scenarios[0].steps = [
      { keyword: 'Given', text: 'I am on the page', provenance: 'ui' },
      { keyword: 'Then', text: 'I see success', provenance: 'ui' },
      { keyword: 'When', text: 'I click submit', provenance: 'ui' },
    ];
    expect(() => validateGherkinDoc(doc)).toThrow(GherkinValidationError);
    expect(() => validateGherkinDoc(doc)).toThrow(/invalid step ordering/);
  });

  it('throws when Given appears after When', () => {
    const doc = makeDoc();
    doc.features[0].scenarios[0].steps = [
      { keyword: 'Given', text: 'I am on the page', provenance: 'ui' },
      { keyword: 'When', text: 'I click submit', provenance: 'ui' },
      { keyword: 'Given', text: 'I am somewhere else', provenance: 'ui' },
      { keyword: 'Then', text: 'I see something', provenance: 'ui' },
    ];
    expect(() => validateGherkinDoc(doc)).toThrow(GherkinValidationError);
    expect(() => validateGherkinDoc(doc)).toThrow(/invalid step ordering/);
  });

  it('throws when And/But appears before any canonical keyword', () => {
    const doc = makeDoc();
    doc.features[0].scenarios[0].steps = [
      { keyword: 'And', text: 'something extra', provenance: 'ui' },
      { keyword: 'Given', text: 'I am on the page', provenance: 'ui' },
      { keyword: 'When', text: 'I click', provenance: 'ui' },
      { keyword: 'Then', text: 'I see success', provenance: 'ui' },
    ];
    expect(() => validateGherkinDoc(doc)).toThrow(GherkinValidationError);
    expect(() => validateGherkinDoc(doc)).toThrow(/cannot appear before a canonical keyword/);
  });

  it('accepts And steps continuing Given phase', () => {
    const doc = makeDoc();
    doc.features[0].scenarios[0].steps = [
      { keyword: 'Given', text: 'I am logged in', provenance: 'ui' },
      { keyword: 'And', text: 'I have items in cart', provenance: 'ui' },
      { keyword: 'When', text: 'I check out', provenance: 'ui' },
      { keyword: 'Then', text: 'I see order confirmation', provenance: 'ui' },
    ];
    expect(() => validateGherkinDoc(doc)).not.toThrow();
  });

  it('accepts And steps continuing Then phase', () => {
    const doc = makeDoc();
    doc.features[0].scenarios[0].steps = [
      { keyword: 'Given', text: 'I am on the page', provenance: 'ui' },
      { keyword: 'When', text: 'I submit', provenance: 'ui' },
      { keyword: 'Then', text: 'I see success', provenance: 'ui' },
      { keyword: 'And', text: 'an email is sent', provenance: 'ui' },
    ];
    expect(() => validateGherkinDoc(doc)).not.toThrow();
  });

  it('accepts But steps in Then phase', () => {
    const doc = makeDoc();
    doc.features[0].scenarios[0].steps = [
      { keyword: 'Given', text: 'I am on the page', provenance: 'ui' },
      { keyword: 'When', text: 'I submit wrong data', provenance: 'ui' },
      { keyword: 'Then', text: 'I see an error', provenance: 'ui' },
      { keyword: 'But', text: 'the form is not cleared', provenance: 'ui' },
    ];
    expect(() => validateGherkinDoc(doc)).not.toThrow();
  });

  it('throws with the feature and scenario name in the message', () => {
    const doc = makeDoc();
    doc.features[0].name = 'MyFeature';
    doc.features[0].scenarios[0].name = 'MyScenario';
    doc.features[0].scenarios[0].steps = [
      { keyword: 'Given', text: 'I am on the page', provenance: 'ui' },
      { keyword: 'When', text: 'I click submit', provenance: 'ui' },
    ];
    expect(() => validateGherkinDoc(doc)).toThrow(/MyFeature/);
    expect(() => validateGherkinDoc(doc)).toThrow(/MyScenario/);
  });

  it('GherkinValidationError has correct name and is instanceof Error', () => {
    const err = new GherkinValidationError('test error');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(GherkinValidationError);
    expect(err.name).toBe('GherkinValidationError');
    expect(err.message).toBe('test error');
  });
});

// ─── GherkinGeneratorService ──────────────────────────────────────────────────

describe('GherkinGeneratorService', () => {
  // ── 1. Happy path ──────────────────────────────────────────────────────────

  describe('happy path', () => {
    it('returns a GherkinDoc with features, scenarios, and ui-provenanced steps', async () => {
      const llm = makeMockLlm([VALID_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.generateGherkin(SAMPLE_TRACE);

      expect(doc.features).toHaveLength(1);
      expect(doc.features[0].scenarios).toHaveLength(1);
      expect(doc.features[0].scenarios[0].steps).toHaveLength(3);

      for (const step of doc.features[0].scenarios[0].steps) {
        expect(step.provenance).toBe('ui');
      }

      expect(doc.generatedAt).toBeInstanceOf(Date);
    });

    it('maps featureName and featureDescription from LLM output', async () => {
      const output: GherkinGenerationOutput = {
        ...VALID_OUTPUT,
        featureName: 'My Generated Feature',
        featureDescription: 'Describes the feature',
      };
      const llm = makeMockLlm([output]);
      const service = buildService(llm);

      const doc = await service.generateGherkin(SAMPLE_TRACE);

      expect(doc.features[0].name).toBe('My Generated Feature');
      expect(doc.features[0].description).toBe('Describes the feature');
    });

    it('omits description when featureDescription is absent', async () => {
      const output: GherkinGenerationOutput = {
        featureName: 'Feature without description',
        scenarios: VALID_OUTPUT.scenarios,
      };
      const llm = makeMockLlm([output]);
      const service = buildService(llm);

      const doc = await service.generateGherkin(SAMPLE_TRACE);

      expect(doc.features[0].description).toBeUndefined();
    });

    it('maps scenario title to scenario name', async () => {
      const llm = makeMockLlm([VALID_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.generateGherkin(SAMPLE_TRACE);

      expect(doc.features[0].scenarios[0].name).toBe('User logs in successfully');
    });

    it('maps all step keywords correctly', async () => {
      const output: GherkinGenerationOutput = {
        featureName: 'Steps Feature',
        scenarios: [
          {
            title: 'Multi-keyword scenario',
            steps: [
              { keyword: 'Given', text: 'context 1' },
              { keyword: 'And', text: 'context 2' },
              { keyword: 'When', text: 'action 1' },
              { keyword: 'Then', text: 'outcome 1' },
              { keyword: 'But', text: 'not outcome 2' },
            ],
          },
        ],
      };
      const llm = makeMockLlm([output]);
      const service = buildService(llm);

      const doc = await service.generateGherkin(SAMPLE_TRACE);
      const steps = doc.features[0].scenarios[0].steps;

      expect(steps.map((s) => s.keyword)).toEqual(['Given', 'And', 'When', 'Then', 'But']);
      expect(steps.every((s) => s.provenance === 'ui')).toBe(true);
    });

    it('calls completeJson with the rendered prompt', async () => {
      const llm = makeMockLlm([VALID_OUTPUT]);
      const service = buildService(llm);

      await service.generateGherkin(SAMPLE_TRACE);

      expect(llm.completeJson).toHaveBeenCalledTimes(1);
      const [prompt] = (llm.completeJson as jest.Mock).mock.calls[0];
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      // Prompt should include the feature name and at least one observation.
      expect(prompt).toContain('Run test-run-1');
      expect(prompt).toContain('User lands on login page');
    });
  });

  // ── 2. Feature name from runId ─────────────────────────────────────────────

  describe('feature name from runId', () => {
    it('uses "Run <runId>" as the feature name in the prompt', async () => {
      const trace: ExploreTrace = { ...SAMPLE_TRACE, runId: 'my-special-run' };
      const llm = makeMockLlm([VALID_OUTPUT]);
      const service = buildService(llm);

      await service.generateGherkin(trace);

      const [prompt] = (llm.completeJson as jest.Mock).mock.calls[0];
      expect(prompt).toContain('Run my-special-run');
    });
  });

  // ── 3. Mapping: provenance = 'ui' ─────────────────────────────────────────

  describe('step provenance', () => {
    it('all steps in generated doc have provenance "ui"', async () => {
      const output: GherkinGenerationOutput = {
        featureName: 'Provenance Test',
        scenarios: [
          {
            title: 'Scenario A',
            steps: [
              { keyword: 'Given', text: 'a' },
              { keyword: 'When', text: 'b' },
              { keyword: 'Then', text: 'c' },
            ],
          },
          {
            title: 'Scenario B',
            steps: [
              { keyword: 'Given', text: 'x' },
              { keyword: 'When', text: 'y' },
              { keyword: 'Then', text: 'z' },
            ],
          },
        ],
      };
      const llm = makeMockLlm([output]);
      const service = buildService(llm);

      const doc = await service.generateGherkin(SAMPLE_TRACE);
      const allSteps = doc.features.flatMap((f) => f.scenarios.flatMap((s) => s.steps));

      expect(allSteps.every((s) => s.provenance === 'ui')).toBe(true);
    });
  });

  // ── 4. Retry on SCHEMA_VALIDATION ─────────────────────────────────────────

  describe('retry on SCHEMA_VALIDATION error', () => {
    it('retries once and succeeds on second call', async () => {
      const llm = makeMockLlm([schemaError(), VALID_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.generateGherkin(SAMPLE_TRACE);

      expect(llm.completeJson).toHaveBeenCalledTimes(2);
      expect(doc.features).toHaveLength(1);
    });

    it('retries twice and succeeds on third call', async () => {
      const llm = makeMockLlm([schemaError(), schemaError(), VALID_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.generateGherkin(SAMPLE_TRACE);

      expect(llm.completeJson).toHaveBeenCalledTimes(3);
      expect(doc.features).toHaveLength(1);
    });
  });

  // ── 5. Retry on GherkinValidationError ────────────────────────────────────

  describe('retry on GherkinValidationError', () => {
    it('retries when LLM returns output that fails validation', async () => {
      // Invalid: scenario missing a Then step.
      const invalidOutput: GherkinGenerationOutput = {
        featureName: 'Bad feature',
        scenarios: [
          {
            title: 'Bad scenario',
            steps: [
              { keyword: 'Given', text: 'I am there' },
              { keyword: 'When', text: 'I click' },
              // No Then — will fail validation.
            ],
          },
        ],
      };
      const llm = makeMockLlm([invalidOutput, VALID_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.generateGherkin(SAMPLE_TRACE);

      expect(llm.completeJson).toHaveBeenCalledTimes(2);
      expect(doc.features[0].scenarios[0].steps.some((s) => s.keyword === 'Then')).toBe(true);
    });
  });

  // ── 6. GherkinGenerationError after max retries ────────────────────────────

  describe('throws GherkinGenerationError after max retries', () => {
    it('throws GherkinGenerationError when all 3 attempts fail with SCHEMA_VALIDATION', async () => {
      const llm = makeMockLlm([schemaError(), schemaError(), schemaError()]);
      const service = buildService(llm);

      await expect(service.generateGherkin(SAMPLE_TRACE)).rejects.toThrow(GherkinGenerationError);
      await expect(service.generateGherkin(SAMPLE_TRACE)).rejects.toThrow(
        /Gherkin generation failed after 3 attempts/
      );
      // 3 initial + 3 second call = 6
      expect(llm.completeJson).toHaveBeenCalledTimes(6);
    });

    it('GherkinGenerationError carries the last error as cause', async () => {
      const lastErr = schemaError();
      // Make every call throw the same error object.
      const llm: Pick<LlmService, 'completeJson' | 'complete' | 'countTokens'> = {
        completeJson: jest.fn().mockRejectedValue(lastErr),
        complete: jest.fn(),
        countTokens: jest.fn().mockReturnValue(0),
      };
      const service = buildService(llm);

      let caught: unknown;
      try {
        await service.generateGherkin(SAMPLE_TRACE);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(GherkinGenerationError);
      const genErr = caught as GherkinGenerationError;
      expect(genErr.cause).toBe(lastErr);
    });

    it('GherkinGenerationError has correct name', () => {
      const err = new GherkinGenerationError('test');
      expect(err.name).toBe('GherkinGenerationError');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(GherkinGenerationError);
    });
  });

  // ── 7. Non-retryable errors are re-thrown immediately ─────────────────────

  describe('non-retryable errors', () => {
    it('wraps a non-SCHEMA_VALIDATION LlmError in GherkinGenerationError immediately', async () => {
      const providerErr = new LlmError('PROVIDER_ERROR', 'upstream is down');
      const llm: Pick<LlmService, 'completeJson' | 'complete' | 'countTokens'> = {
        completeJson: jest.fn().mockRejectedValue(providerErr),
        complete: jest.fn(),
        countTokens: jest.fn().mockReturnValue(0),
      };
      const service = buildService(llm);

      await expect(service.generateGherkin(SAMPLE_TRACE)).rejects.toThrow(GherkinGenerationError);
      // Only one attempt — no retry for non-SCHEMA_VALIDATION codes.
      expect(llm.completeJson).toHaveBeenCalledTimes(1);
    });

    it('wraps RATE_LIMITED immediately without retry', async () => {
      const rateLimitErr = new LlmError('RATE_LIMITED', 'slow down');
      const llm: Pick<LlmService, 'completeJson' | 'complete' | 'countTokens'> = {
        completeJson: jest.fn().mockRejectedValue(rateLimitErr),
        complete: jest.fn(),
        countTokens: jest.fn().mockReturnValue(0),
      };
      const service = buildService(llm);

      await expect(service.generateGherkin(SAMPLE_TRACE)).rejects.toThrow(GherkinGenerationError);
      expect(llm.completeJson).toHaveBeenCalledTimes(1);
    });
  });

  // ── 8. Edge: empty steps trace ────────────────────────────────────────────

  describe('edge cases', () => {
    it('works when the trace has no steps (empty observations list)', async () => {
      const emptyTrace: ExploreTrace = { ...SAMPLE_TRACE, steps: [] };
      const llm = makeMockLlm([VALID_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.generateGherkin(emptyTrace);

      expect(doc.features).toHaveLength(1);
      const [prompt] = (llm.completeJson as jest.Mock).mock.calls[0];
      // Prompt should still be non-empty.
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      // With no steps there should be no numbered observations (e.g. "1. User…")
      // — we verify by checking the observations section is empty.
      expect(prompt).toContain('## UI observations\n\n\n##');
    });

    it('handles multi-scenario output correctly', async () => {
      const output: GherkinGenerationOutput = {
        featureName: 'Multi',
        scenarios: [
          {
            title: 'Scenario 1',
            steps: [
              { keyword: 'Given', text: 'a' },
              { keyword: 'When', text: 'b' },
              { keyword: 'Then', text: 'c' },
            ],
          },
          {
            title: 'Scenario 2',
            steps: [
              { keyword: 'Given', text: 'd' },
              { keyword: 'When', text: 'e' },
              { keyword: 'Then', text: 'f' },
            ],
          },
        ],
      };
      const llm = makeMockLlm([output]);
      const service = buildService(llm);

      const doc = await service.generateGherkin(SAMPLE_TRACE);

      expect(doc.features[0].scenarios).toHaveLength(2);
      expect(doc.features[0].scenarios[0].name).toBe('Scenario 1');
      expect(doc.features[0].scenarios[1].name).toBe('Scenario 2');
    });
  });
});
