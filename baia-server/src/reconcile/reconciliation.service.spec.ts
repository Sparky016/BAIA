/**
 * Tests for ReconciliationService (S5-01).
 *
 * LlmService is mocked with jest.fn() — no NestJS DI bootstrap, no real LLM.
 * Covers: rule-matched enrichment, conflict annotation, code-only gap, ui-only step.
 */

import { BusinessRule, GherkinDoc } from '@baia/shared';

import { LlmError, LlmService } from '../llm/llm.service';
import { ReconciliationOutput } from '../llm/prompts/reconciliation.prompt';
import { ReconciliationError, ReconciliationService } from './reconciliation.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_DOC: GherkinDoc = {
  features: [
    {
      name: 'Login',
      scenarios: [
        {
          name: 'User logs in successfully',
          steps: [
            { keyword: 'Given', text: 'the user is on the login page', provenance: 'ui' },
            { keyword: 'When', text: 'the user enters valid credentials', provenance: 'ui' },
            { keyword: 'Then', text: 'the user is redirected to the dashboard', provenance: 'ui' },
          ],
        },
      ],
    },
  ],
  generatedAt: new Date('2024-01-01T00:00:00Z'),
};

const SAMPLE_RULES: BusinessRule[] = [
  {
    id: 'auth::rule-1',
    description: 'Users must authenticate before accessing the dashboard',
    category: 'auth',
    sourceRef: 'auth/auth.service.ts:chunk0',
  },
];

// ── LLM output fixtures ────────────────────────────────────────────────────────

/** Scenario where UI steps are matched by a code rule → enriched to 'merged'. */
const MATCHED_OUTPUT: ReconciliationOutput = {
  featureName: 'Login',
  scenarios: [
    {
      title: 'User logs in successfully',
      status: 'matched',
      rationale: 'UI steps align with auth rule',
      steps: [
        { keyword: 'Given', text: 'the user is on the login page' },
        { keyword: 'When', text: 'the user enters valid credentials' },
        {
          keyword: 'Then',
          text: 'the user is redirected to the dashboard',
          supportedBy: ['auth::rule-1'],
        },
      ],
    },
  ],
  gaps: [],
  conflicts: [],
  confidenceScore: 90,
};

/** Scenario that contradicts a code rule → conflict annotation. */
const CONFLICT_OUTPUT: ReconciliationOutput = {
  featureName: 'Login',
  scenarios: [
    {
      title: 'Admin bypasses authentication',
      status: 'conflict',
      rationale: 'UI allows bypass but auth rule prohibits unauthenticated access',
      steps: [
        { keyword: 'Given', text: 'the admin is on the dashboard' },
        { keyword: 'When', text: 'the admin accesses without login' },
        { keyword: 'Then', text: 'the dashboard is displayed' },
      ],
    },
  ],
  gaps: [],
  conflicts: [
    {
      ruleId: 'auth::rule-1',
      scenarioTitle: 'Admin bypasses authentication',
      description: 'Contradicts mandatory authentication requirement',
    },
  ],
  confidenceScore: 40,
};

/** Code-only rule with no matching UI scenario → gap added as 'code' scenario. */
const GAP_OUTPUT: ReconciliationOutput = {
  featureName: 'Login',
  scenarios: [],
  gaps: [
    {
      ruleId: 'password::rule-2',
      statement: 'Password must be at least 8 characters',
      suggestedStep: 'the password meets minimum length requirements',
    },
  ],
  conflicts: [],
  confidenceScore: 70,
};

/** UI-only step with no code rule → kept as 'ui' provenance (status = 'new'). */
const NEW_OUTPUT: ReconciliationOutput = {
  featureName: 'Login',
  scenarios: [
    {
      title: 'User sees loading spinner',
      status: 'new',
      rationale: 'No code rule matches this UI behavior',
      steps: [
        { keyword: 'Given', text: 'the user is on the login page' },
        { keyword: 'When', text: 'the user submits the form' },
        { keyword: 'Then', text: 'a loading spinner appears' },
      ],
    },
  ],
  gaps: [],
  conflicts: [],
  confidenceScore: 80,
};

// ─── Mock factory ─────────────────────────────────────────────────────────────

function makeMockLlm(
  responses: Array<ReconciliationOutput | LlmError | Error>
): jest.Mocked<Pick<LlmService, 'completeJson' | 'complete' | 'countTokens'>> {
  let callIndex = 0;
  const completeJson = jest.fn().mockImplementation(async () => {
    const entry = responses[callIndex % responses.length];
    callIndex++;
    if (entry instanceof Error) throw entry;
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
): ReconciliationService {
  return new ReconciliationService(llm as LlmService);
}

function schemaError(): LlmError {
  return new LlmError('SCHEMA_VALIDATION', 'model output failed validation', { raw: '{}' });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ReconciliationService', () => {
  // ── 1. Rule matches a step → provenance 'merged' ────────────────────────────

  describe('matched scenario', () => {
    it('enriches steps with supportedBy to provenance "merged"', async () => {
      const llm = makeMockLlm([MATCHED_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);

      const steps = doc.features[0].scenarios[0].steps;
      expect(steps[0].provenance).toBe('ui');
      expect(steps[1].provenance).toBe('ui');
      expect(steps[2].provenance).toBe('merged');
    });

    it('steps without supportedBy keep provenance "ui"', async () => {
      const llm = makeMockLlm([MATCHED_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);
      const steps = doc.features[0].scenarios[0].steps;

      expect(steps[0].provenance).toBe('ui');
      expect(steps[1].provenance).toBe('ui');
    });

    it('does not set conflictNote on a matched scenario', async () => {
      const llm = makeMockLlm([MATCHED_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);
      expect(doc.features[0].scenarios[0].conflictNote).toBeUndefined();
    });

    it('preserves scenario name and step text from LLM output', async () => {
      const llm = makeMockLlm([MATCHED_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);
      const scenario = doc.features[0].scenarios[0];

      expect(scenario.name).toBe('User logs in successfully');
      expect(scenario.steps[2].text).toBe('the user is redirected to the dashboard');
    });
  });

  // ── 2. Conflict scenario → conflictNote set ──────────────────────────────────

  describe('conflict scenario', () => {
    it('sets conflictNote with the rationale from the LLM output', async () => {
      const llm = makeMockLlm([CONFLICT_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);
      const scenario = doc.features[0].scenarios[0];

      expect(scenario.conflictNote).toBe(
        'UI allows bypass but auth rule prohibits unauthenticated access'
      );
    });

    it('conflict scenario steps without supportedBy have provenance "ui"', async () => {
      const llm = makeMockLlm([CONFLICT_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);
      const steps = doc.features[0].scenarios[0].steps;

      expect(steps.every((s) => s.provenance === 'ui')).toBe(true);
    });
  });

  // ── 3. Code-only rule (gap) → new scenario with 'code' provenance ────────────

  describe('gap (code-only rule)', () => {
    it('creates a new scenario for each gap with provenance "code"', async () => {
      const llm = makeMockLlm([GAP_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);

      expect(doc.features[0].scenarios).toHaveLength(1);
      const gapScenario = doc.features[0].scenarios[0];
      expect(gapScenario.name).toBe('Code Rule: password::rule-2');
      expect(gapScenario.steps.every((s) => s.provenance === 'code')).toBe(true);
    });

    it('gap scenario has valid Given-When-Then structure', async () => {
      const llm = makeMockLlm([GAP_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);
      const steps = doc.features[0].scenarios[0].steps;

      expect(steps.map((s) => s.keyword)).toEqual(['Given', 'When', 'Then']);
    });

    it('gap scenario Then step uses suggestedStep text', async () => {
      const llm = makeMockLlm([GAP_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);
      const thenStep = doc.features[0].scenarios[0].steps.find((s) => s.keyword === 'Then');

      expect(thenStep?.text).toBe('the password meets minimum length requirements');
    });

    it('gap scenario Given step includes the rule statement', async () => {
      const llm = makeMockLlm([GAP_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);
      const givenStep = doc.features[0].scenarios[0].steps[0];

      expect(givenStep.text).toContain('Password must be at least 8 characters');
    });

    it('gap scenario has no conflictNote', async () => {
      const llm = makeMockLlm([GAP_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);
      expect(doc.features[0].scenarios[0].conflictNote).toBeUndefined();
    });
  });

  // ── 4. UI-only step (status = 'new') → provenance 'ui' ──────────────────────

  describe('ui-only step (new scenario)', () => {
    it('keeps steps with no supportedBy as provenance "ui"', async () => {
      const llm = makeMockLlm([NEW_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);
      const steps = doc.features[0].scenarios[0].steps;

      expect(steps.every((s) => s.provenance === 'ui')).toBe(true);
    });

    it('new scenario has no conflictNote', async () => {
      const llm = makeMockLlm([NEW_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);
      expect(doc.features[0].scenarios[0].conflictNote).toBeUndefined();
    });
  });

  // ── 5. Mixed output (scenarios + gaps) ───────────────────────────────────────

  describe('mixed output', () => {
    it('appends gap scenarios after enriched scenarios', async () => {
      const mixed: ReconciliationOutput = {
        featureName: 'Login',
        scenarios: [
          {
            title: 'User logs in',
            status: 'matched',
            rationale: 'Matched',
            steps: [
              { keyword: 'Given', text: 'context', supportedBy: ['auth::rule-1'] },
              { keyword: 'When', text: 'action' },
              { keyword: 'Then', text: 'outcome' },
            ],
          },
        ],
        gaps: [
          {
            ruleId: 'val::rule-3',
            statement: 'Email must be valid',
            suggestedStep: 'the email format is validated',
          },
        ],
        conflicts: [],
        confidenceScore: 75,
      };

      const llm = makeMockLlm([mixed]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);
      const scenarios = doc.features[0].scenarios;

      expect(scenarios).toHaveLength(2);
      expect(scenarios[0].name).toBe('User logs in');
      expect(scenarios[1].name).toBe('Code Rule: val::rule-3');
      expect(scenarios[0].steps[0].provenance).toBe('merged');
      expect(scenarios[1].steps.every((s) => s.provenance === 'code')).toBe(true);
    });
  });

  // ── 6. Output structure ──────────────────────────────────────────────────────

  describe('output structure', () => {
    it('returns a GherkinDoc with one feature', async () => {
      const llm = makeMockLlm([MATCHED_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);

      expect(doc.features).toHaveLength(1);
      expect(doc.generatedAt).toBeInstanceOf(Date);
    });

    it('uses the original feature name from gherkinDoc', async () => {
      const llm = makeMockLlm([MATCHED_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);

      expect(doc.features[0].name).toBe('Login');
    });

    it('calls completeJson with a non-empty prompt', async () => {
      const llm = makeMockLlm([MATCHED_OUTPUT]);
      const service = buildService(llm);

      await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);

      expect(llm.completeJson).toHaveBeenCalledTimes(1);
      const [prompt] = (llm.completeJson as jest.Mock).mock.calls[0];
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('includes feature name in the prompt', async () => {
      const llm = makeMockLlm([MATCHED_OUTPUT]);
      const service = buildService(llm);

      await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);

      const [prompt] = (llm.completeJson as jest.Mock).mock.calls[0];
      expect(prompt).toContain('Login');
    });
  });

  // ── 7. Empty / edge inputs ───────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles a GherkinDoc with no features — defaults featureName to "Feature"', async () => {
      const emptyDoc: GherkinDoc = { features: [], generatedAt: new Date() };
      const emptyOutput: ReconciliationOutput = {
        featureName: 'Feature',
        scenarios: [],
        gaps: [],
        conflicts: [],
        confidenceScore: 0,
      };

      const llm = makeMockLlm([emptyOutput]);
      const service = buildService(llm);

      const doc = await service.reconcile(emptyDoc, SAMPLE_RULES);
      expect(doc.features[0].name).toBe('Feature');
    });

    it('handles empty rules array', async () => {
      const llm = makeMockLlm([NEW_OUTPUT]);
      const service = buildService(llm);

      await expect(service.reconcile(SAMPLE_DOC, [])).resolves.toBeDefined();
    });

    it('falls back unknown keyword to "When"', async () => {
      const outputWithBadKeyword: ReconciliationOutput = {
        featureName: 'Login',
        scenarios: [
          {
            title: 'Bad keyword scenario',
            status: 'new',
            rationale: 'test',
            steps: [
              { keyword: 'Given', text: 'context' },
              { keyword: 'INVALID_KW' as 'When', text: 'action' },
              { keyword: 'Then', text: 'outcome' },
            ],
          },
        ],
        gaps: [],
        conflicts: [],
        confidenceScore: 50,
      };

      const llm = makeMockLlm([outputWithBadKeyword]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);
      const steps = doc.features[0].scenarios[0].steps;

      expect(steps[1].keyword).toBe('When');
    });

    it('handles multiple features in input by flattening scenarios', async () => {
      const multiFeatureDoc: GherkinDoc = {
        features: [
          {
            name: 'Feature A',
            scenarios: [
              {
                name: 'Scenario A1',
                steps: [
                  { keyword: 'Given', text: 'ctx', provenance: 'ui' },
                  { keyword: 'When', text: 'act', provenance: 'ui' },
                  { keyword: 'Then', text: 'out', provenance: 'ui' },
                ],
              },
            ],
          },
          {
            name: 'Feature B',
            scenarios: [
              {
                name: 'Scenario B1',
                steps: [
                  { keyword: 'Given', text: 'ctx2', provenance: 'ui' },
                  { keyword: 'When', text: 'act2', provenance: 'ui' },
                  { keyword: 'Then', text: 'out2', provenance: 'ui' },
                ],
              },
            ],
          },
        ],
        generatedAt: new Date(),
      };

      const llm = makeMockLlm([NEW_OUTPUT]);
      const service = buildService(llm);

      const [prompt] = await (async () => {
        await service.reconcile(multiFeatureDoc, SAMPLE_RULES);
        return (llm.completeJson as jest.Mock).mock.calls[0];
      })();

      // Both scenario titles should appear in the prompt
      expect(prompt).toContain('Scenario A1');
      expect(prompt).toContain('Scenario B1');
    });
  });

  // ── 8. Retry on SCHEMA_VALIDATION ────────────────────────────────────────────

  describe('retry on SCHEMA_VALIDATION', () => {
    it('retries once and succeeds on second attempt', async () => {
      const llm = makeMockLlm([schemaError(), MATCHED_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);

      expect(llm.completeJson).toHaveBeenCalledTimes(2);
      expect(doc.features).toHaveLength(1);
    });

    it('retries twice and succeeds on third attempt', async () => {
      const llm = makeMockLlm([schemaError(), schemaError(), MATCHED_OUTPUT]);
      const service = buildService(llm);

      const doc = await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);

      expect(llm.completeJson).toHaveBeenCalledTimes(3);
      expect(doc.features[0].scenarios).toHaveLength(1);
    });
  });

  // ── 9. ReconciliationError after max retries ──────────────────────────────────

  describe('throws ReconciliationError after max retries', () => {
    it('throws after 3 SCHEMA_VALIDATION failures', async () => {
      const llm = makeMockLlm([schemaError(), schemaError(), schemaError()]);
      const service = buildService(llm);

      await expect(service.reconcile(SAMPLE_DOC, SAMPLE_RULES)).rejects.toThrow(
        ReconciliationError
      );
      await expect(service.reconcile(SAMPLE_DOC, SAMPLE_RULES)).rejects.toThrow(
        /Reconciliation failed after 3 attempts/
      );
      // 3 + 3 attempts
      expect(llm.completeJson).toHaveBeenCalledTimes(6);
    });

    it('carries the last error as cause', async () => {
      const last = schemaError();
      const llm: Pick<LlmService, 'completeJson' | 'complete' | 'countTokens'> = {
        completeJson: jest.fn().mockRejectedValue(last),
        complete: jest.fn(),
        countTokens: jest.fn().mockReturnValue(0),
      };
      const service = buildService(llm);

      let caught: unknown;
      try {
        await service.reconcile(SAMPLE_DOC, SAMPLE_RULES);
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(ReconciliationError);
      expect((caught as ReconciliationError).cause).toBe(last);
    });
  });

  // ── 10. Non-retryable errors ──────────────────────────────────────────────────

  describe('non-retryable errors', () => {
    it('wraps PROVIDER_ERROR immediately without retry', async () => {
      const providerErr = new LlmError('PROVIDER_ERROR', 'upstream is down');
      const llm: Pick<LlmService, 'completeJson' | 'complete' | 'countTokens'> = {
        completeJson: jest.fn().mockRejectedValue(providerErr),
        complete: jest.fn(),
        countTokens: jest.fn().mockReturnValue(0),
      };
      const service = buildService(llm);

      await expect(service.reconcile(SAMPLE_DOC, SAMPLE_RULES)).rejects.toThrow(
        ReconciliationError
      );
      expect(llm.completeJson).toHaveBeenCalledTimes(1);
    });

    it('wraps RATE_LIMITED immediately without retry', async () => {
      const rateLimitErr = new LlmError('RATE_LIMITED', 'too many requests');
      const llm: Pick<LlmService, 'completeJson' | 'complete' | 'countTokens'> = {
        completeJson: jest.fn().mockRejectedValue(rateLimitErr),
        complete: jest.fn(),
        countTokens: jest.fn().mockReturnValue(0),
      };
      const service = buildService(llm);

      await expect(service.reconcile(SAMPLE_DOC, SAMPLE_RULES)).rejects.toThrow(
        ReconciliationError
      );
      expect(llm.completeJson).toHaveBeenCalledTimes(1);
    });

    it('wraps TIMEOUT immediately without retry', async () => {
      const timeoutErr = new LlmError('TIMEOUT', 'request timed out');
      const llm: Pick<LlmService, 'completeJson' | 'complete' | 'countTokens'> = {
        completeJson: jest.fn().mockRejectedValue(timeoutErr),
        complete: jest.fn(),
        countTokens: jest.fn().mockReturnValue(0),
      };
      const service = buildService(llm);

      await expect(service.reconcile(SAMPLE_DOC, SAMPLE_RULES)).rejects.toThrow(
        ReconciliationError
      );
      expect(llm.completeJson).toHaveBeenCalledTimes(1);
    });

    it('wraps a non-LlmError in ReconciliationError', async () => {
      const genericErr = new Error('unexpected failure');
      const llm: Pick<LlmService, 'completeJson' | 'complete' | 'countTokens'> = {
        completeJson: jest.fn().mockRejectedValue(genericErr),
        complete: jest.fn(),
        countTokens: jest.fn().mockReturnValue(0),
      };
      const service = buildService(llm);

      await expect(service.reconcile(SAMPLE_DOC, SAMPLE_RULES)).rejects.toThrow(
        ReconciliationError
      );
      expect(llm.completeJson).toHaveBeenCalledTimes(1);
    });

    it('includes error message in ReconciliationError message', async () => {
      const providerErr = new LlmError('PROVIDER_ERROR', 'specific failure reason');
      const llm: Pick<LlmService, 'completeJson' | 'complete' | 'countTokens'> = {
        completeJson: jest.fn().mockRejectedValue(providerErr),
        complete: jest.fn(),
        countTokens: jest.fn().mockReturnValue(0),
      };
      const service = buildService(llm);

      await expect(service.reconcile(SAMPLE_DOC, SAMPLE_RULES)).rejects.toThrow(
        /specific failure reason/
      );
    });
  });

  // ── 11. ReconciliationError class ─────────────────────────────────────────────

  describe('ReconciliationError', () => {
    it('has correct name', () => {
      const err = new ReconciliationError('test');
      expect(err.name).toBe('ReconciliationError');
    });

    it('is instanceof Error and ReconciliationError', () => {
      const err = new ReconciliationError('test');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(ReconciliationError);
    });

    it('stores cause', () => {
      const cause = new Error('root cause');
      const err = new ReconciliationError('wrapper', cause);
      expect(err.cause).toBe(cause);
    });

    it('works without cause', () => {
      const err = new ReconciliationError('no cause');
      expect(err.cause).toBeUndefined();
      expect(err.message).toBe('no cause');
    });
  });
});
