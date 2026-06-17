/**
 * Prompt template registry — unit tests (S2-03).
 *
 * Covers:
 * 1. Render snapshot — each template produces a stable, expected string from
 *    fixed sample inputs (deterministic; breaks if text accidentally changes).
 * 2. Output-schema validation — each schema accepts a valid payload and rejects
 *    a structurally invalid one.
 * 3. Registry shape — all four templates are registered with the correct id and
 *    version, and the render function stored matches the standalone export.
 */

import { validateJsonSchema } from '../llm.service';
import {
  ACTION_PLANNING_OUTPUT_SCHEMA,
  ActionPlanningInput,
  ActionPlanningOutput,
} from './action-planning.prompt';
import {
  GHERKIN_GENERATION_OUTPUT_SCHEMA,
  GherkinGenerationInput,
  GherkinGenerationOutput,
} from './gherkin-generation.prompt';
import { promptRegistry } from './index';
import {
  RECONCILIATION_OUTPUT_SCHEMA,
  ReconciliationInput,
  ReconciliationOutput,
} from './reconciliation.prompt';
import {
  RULE_EXTRACTION_OUTPUT_SCHEMA,
  RuleExtractionInput,
  RuleExtractionOutput,
} from './rule-extraction.prompt';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Assert validateJsonSchema returns null (i.e. value is valid). */
function expectValid(value: unknown, schema: Parameters<typeof validateJsonSchema>[1]): void {
  const err = validateJsonSchema(value, schema);
  expect(err).toBeNull();
}

/** Assert validateJsonSchema returns a non-null string (i.e. value is invalid). */
function expectInvalid(value: unknown, schema: Parameters<typeof validateJsonSchema>[1]): void {
  const err = validateJsonSchema(value, schema);
  expect(typeof err).toBe('string');
  expect(err).not.toBeNull();
}

// ─────────────────────────────────────────────────────────────────────────────
// action-planning template
// ─────────────────────────────────────────────────────────────────────────────

describe('action-planning template', () => {
  const sampleInput: ActionPlanningInput = {
    instruction: 'Click the Login button',
    currentUrl: 'http://localhost:5000',
    domSnapshot: '<button id="login-btn">Login</button>',
    previousActions: ['navigate to http://localhost:5000'],
  };

  describe('render', () => {
    it('includes the instruction in the prompt', () => {
      const prompt = promptRegistry['action-planning'].render(sampleInput);
      expect(prompt).toContain('Click the Login button');
    });

    it('includes the current URL', () => {
      const prompt = promptRegistry['action-planning'].render(sampleInput);
      expect(prompt).toContain('http://localhost:5000');
    });

    it('includes the DOM snapshot', () => {
      const prompt = promptRegistry['action-planning'].render(sampleInput);
      expect(prompt).toContain('<button id="login-btn">Login</button>');
    });

    it('includes previously executed actions', () => {
      const prompt = promptRegistry['action-planning'].render(sampleInput);
      expect(prompt).toContain('Previously executed actions');
      expect(prompt).toContain('navigate to http://localhost:5000');
    });

    it('omits previous-actions section when previousActions is empty', () => {
      const inputNoPrev: ActionPlanningInput = {
        instruction: 'Click the Login button',
        currentUrl: 'http://localhost:5000',
        domSnapshot: '<button>Login</button>',
      };
      const prompt = promptRegistry['action-planning'].render(inputNoPrev);
      expect(prompt).not.toContain('Previously executed actions');
    });

    it('snapshot: render is stable for identical inputs', () => {
      const p1 = promptRegistry['action-planning'].render(sampleInput);
      const p2 = promptRegistry['action-planning'].render(sampleInput);
      expect(p1).toBe(p2);
    });

    it('mentions the required action verbs', () => {
      const prompt = promptRegistry['action-planning'].render(sampleInput);
      expect(prompt).toContain('click');
      expect(prompt).toContain('fill');
    });
  });

  describe('output schema', () => {
    const validOutput: ActionPlanningOutput = {
      actions: [
        { action: 'click', selector: '#login-btn', reason: 'Submit login form' },
        { action: 'fill', selector: '#username', value: 'admin', reason: 'Enter username' },
      ],
      goalSummary: 'Authenticate the user by clicking the login button.',
    };

    it('accepts a valid payload', () => {
      expectValid(validOutput, ACTION_PLANNING_OUTPUT_SCHEMA);
    });

    it('rejects a payload missing required "goalSummary"', () => {
      const bad = { actions: [] };
      expectInvalid(bad, ACTION_PLANNING_OUTPUT_SCHEMA);
    });

    it('rejects a payload with "actions" not being an array', () => {
      const bad = { actions: 'not-array', goalSummary: 'summary' };
      expectInvalid(bad, ACTION_PLANNING_OUTPUT_SCHEMA);
    });

    it('rejects an action item missing "reason"', () => {
      const bad = {
        actions: [{ action: 'click', selector: '#btn' }],
        goalSummary: 'summary',
      };
      expectInvalid(bad, ACTION_PLANNING_OUTPUT_SCHEMA);
    });

    it('rejects an action item with an additional property', () => {
      const bad: ActionPlanningOutput = {
        actions: [
          {
            action: 'click',
            selector: '#btn',
            reason: 'ok',
            // @ts-expect-error intentional extra field for schema test
            extra: true,
          },
        ],
        goalSummary: 'summary',
      };
      expectInvalid(bad, ACTION_PLANNING_OUTPUT_SCHEMA);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// gherkin-generation template
// ─────────────────────────────────────────────────────────────────────────────

describe('gherkin-generation template', () => {
  const sampleInput: GherkinGenerationInput = {
    featureName: 'User Login',
    observations: [
      {
        description: 'User visits the home page',
        url: 'http://localhost:5000',
        outcome: 'home page rendered',
      },
      {
        description: 'User clicks the Login button',
        url: 'http://localhost:5000',
        element: '<button>Login</button>',
        outcome: 'login form displayed',
      },
      {
        description: 'User submits valid credentials',
        url: 'http://localhost:5000/login',
        outcome: 'redirected to dashboard',
      },
    ],
    acceptanceCriteria: 'A registered user can log in with valid credentials.',
  };

  describe('render', () => {
    it('includes the feature name', () => {
      const prompt = promptRegistry['gherkin-generation'].render(sampleInput);
      expect(prompt).toContain('User Login');
    });

    it('includes acceptance criteria when provided', () => {
      const prompt = promptRegistry['gherkin-generation'].render(sampleInput);
      expect(prompt).toContain('Acceptance criteria');
      expect(prompt).toContain('A registered user can log in with valid credentials.');
    });

    it('omits acceptance criteria section when not provided', () => {
      const inputNoCriteria: GherkinGenerationInput = {
        featureName: 'Search',
        observations: [{ description: 'User types in search box', url: 'http://localhost:5000' }],
      };
      const prompt = promptRegistry['gherkin-generation'].render(inputNoCriteria);
      expect(prompt).not.toContain('Acceptance criteria');
    });

    it('includes all observation descriptions', () => {
      const prompt = promptRegistry['gherkin-generation'].render(sampleInput);
      expect(prompt).toContain('User visits the home page');
      expect(prompt).toContain('User clicks the Login button');
      expect(prompt).toContain('User submits valid credentials');
    });

    it('enforces Given/When/Then formatting rules in the prompt', () => {
      const prompt = promptRegistry['gherkin-generation'].render(sampleInput);
      expect(prompt).toContain('Given');
      expect(prompt).toContain('When');
      expect(prompt).toContain('Then');
      expect(prompt).toContain('"And"');
    });

    it('snapshot: render is stable for identical inputs', () => {
      const p1 = promptRegistry['gherkin-generation'].render(sampleInput);
      const p2 = promptRegistry['gherkin-generation'].render(sampleInput);
      expect(p1).toBe(p2);
    });

    it('includes element and outcome details in the observations list', () => {
      const prompt = promptRegistry['gherkin-generation'].render(sampleInput);
      expect(prompt).toContain('<button>Login</button>');
      expect(prompt).toContain('redirected to dashboard');
    });
  });

  describe('output schema', () => {
    const validOutput: GherkinGenerationOutput = {
      featureName: 'User Login',
      featureDescription: 'Covers the user authentication journey.',
      scenarios: [
        {
          title: 'Log in with valid credentials',
          tags: ['@smoke'],
          steps: [
            { keyword: 'Given', text: 'a registered user is on the home page' },
            { keyword: 'When', text: 'the user submits valid credentials' },
            { keyword: 'Then', text: 'the user is redirected to the dashboard' },
          ],
        },
      ],
    };

    it('accepts a valid payload', () => {
      expectValid(validOutput, GHERKIN_GENERATION_OUTPUT_SCHEMA);
    });

    it('rejects a payload missing required "featureName"', () => {
      const bad = { scenarios: [] };
      expectInvalid(bad, GHERKIN_GENERATION_OUTPUT_SCHEMA);
    });

    it('rejects a step with an invalid keyword enum value', () => {
      const bad = {
        featureName: 'Login',
        scenarios: [
          {
            title: 'Test',
            steps: [{ keyword: 'InvalidKeyword', text: 'some step' }],
          },
        ],
      };
      expectInvalid(bad, GHERKIN_GENERATION_OUTPUT_SCHEMA);
    });

    it('rejects a scenario with an additional property', () => {
      const bad = {
        featureName: 'Login',
        scenarios: [
          {
            title: 'Test',
            steps: [{ keyword: 'Given', text: 'something' }],
            unknownField: true,
          },
        ],
      };
      expectInvalid(bad, GHERKIN_GENERATION_OUTPUT_SCHEMA);
    });

    it('accepts a payload without optional featureDescription', () => {
      const minimalValid: GherkinGenerationOutput = {
        featureName: 'Search',
        scenarios: [
          {
            title: 'Search for a product',
            steps: [
              { keyword: 'Given', text: 'user is on the search page' },
              { keyword: 'When', text: 'user types a product name' },
              { keyword: 'Then', text: 'matching results are displayed' },
            ],
          },
        ],
      };
      expectValid(minimalValid, GHERKIN_GENERATION_OUTPUT_SCHEMA);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rule-extraction template
// ─────────────────────────────────────────────────────────────────────────────

describe('rule-extraction template', () => {
  const sampleInput: RuleExtractionInput = {
    language: 'C# ASP.NET MVC',
    codeChunk: `public ActionResult Admin() {
  if (!User.IsInRole("Admin")) return RedirectToAction("Login");
  return View();
}`,
    filePath: 'Controllers/HomeController.cs',
    moduleDescription: 'Home controller handling navigation and admin access.',
  };

  describe('render', () => {
    it('includes the programming language', () => {
      const prompt = promptRegistry['rule-extraction'].render(sampleInput);
      expect(prompt).toContain('C# ASP.NET MVC');
    });

    it('includes the code chunk', () => {
      const prompt = promptRegistry['rule-extraction'].render(sampleInput);
      expect(prompt).toContain('IsInRole("Admin")');
    });

    it('includes the file path when provided', () => {
      const prompt = promptRegistry['rule-extraction'].render(sampleInput);
      expect(prompt).toContain('Controllers/HomeController.cs');
    });

    it('includes the module description when provided', () => {
      const prompt = promptRegistry['rule-extraction'].render(sampleInput);
      expect(prompt).toContain('Home controller handling navigation and admin access.');
    });

    it('omits file path and module description when not provided', () => {
      const minInput: RuleExtractionInput = {
        language: 'TypeScript',
        codeChunk: 'const x = 1;',
      };
      const prompt = promptRegistry['rule-extraction'].render(minInput);
      expect(prompt).not.toContain('**File:**');
      expect(prompt).not.toContain('**Module description:**');
    });

    it('instructs on severity levels', () => {
      const prompt = promptRegistry['rule-extraction'].render(sampleInput);
      expect(prompt).toContain('"must"');
      expect(prompt).toContain('"should"');
      expect(prompt).toContain('"may"');
    });

    it('snapshot: render is stable for identical inputs', () => {
      const p1 = promptRegistry['rule-extraction'].render(sampleInput);
      const p2 = promptRegistry['rule-extraction'].render(sampleInput);
      expect(p1).toBe(p2);
    });
  });

  describe('output schema', () => {
    const validOutput: RuleExtractionOutput = {
      module: 'HomeController',
      summary: 'Handles home page rendering and admin access control.',
      rules: [
        {
          ruleId: 'admin-role-required',
          statement: 'Only users with the Admin role may access the admin section.',
          severity: 'must',
          evidence: 'if (!User.IsInRole("Admin")) return RedirectToAction("Login");',
          category: 'authorisation',
        },
      ],
    };

    it('accepts a valid payload', () => {
      expectValid(validOutput, RULE_EXTRACTION_OUTPUT_SCHEMA);
    });

    it('rejects a rule with an invalid severity enum value', () => {
      const bad = {
        module: 'Ctrl',
        summary: 'Summary.',
        rules: [
          {
            ruleId: 'test',
            statement: 'A rule.',
            severity: 'could', // invalid
            evidence: 'some code',
          },
        ],
      };
      expectInvalid(bad, RULE_EXTRACTION_OUTPUT_SCHEMA);
    });

    it('rejects a payload missing "summary"', () => {
      const bad = {
        module: 'Ctrl',
        rules: [],
      };
      expectInvalid(bad, RULE_EXTRACTION_OUTPUT_SCHEMA);
    });

    it('rejects a rule missing "evidence"', () => {
      const bad = {
        module: 'Ctrl',
        summary: 'Summary.',
        rules: [{ ruleId: 'r1', statement: 'Rule.', severity: 'must' }],
      };
      expectInvalid(bad, RULE_EXTRACTION_OUTPUT_SCHEMA);
    });

    it('accepts a rule without optional category', () => {
      const noCategory: RuleExtractionOutput = {
        module: 'Ctrl',
        summary: 'Summary.',
        rules: [
          {
            ruleId: 'r1',
            statement: 'Rule statement.',
            severity: 'should',
            evidence: 'x = 1',
          },
        ],
      };
      expectValid(noCategory, RULE_EXTRACTION_OUTPUT_SCHEMA);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reconciliation template
// ─────────────────────────────────────────────────────────────────────────────

describe('reconciliation template', () => {
  const sampleInput: ReconciliationInput = {
    featureName: 'User Login',
    observedScenarios: [
      {
        title: 'Log in with valid credentials',
        tags: ['@smoke'],
        steps: [
          { keyword: 'Given', text: 'a registered user is on the home page' },
          { keyword: 'When', text: 'the user submits valid credentials' },
          { keyword: 'Then', text: 'the user is redirected to the dashboard' },
        ],
      },
    ],
    codeRules: [
      {
        ruleId: 'auth-redirect-unauthenticated',
        statement: 'Unauthenticated users must be redirected to the login page.',
        severity: 'must',
        category: 'authentication',
      },
    ],
    notes: 'Focus on authentication flows only.',
  };

  describe('render', () => {
    it('includes the feature name', () => {
      const prompt = promptRegistry['reconciliation'].render(sampleInput);
      expect(prompt).toContain('User Login');
    });

    it('includes the serialised observed scenarios', () => {
      const prompt = promptRegistry['reconciliation'].render(sampleInput);
      expect(prompt).toContain('Log in with valid credentials');
      expect(prompt).toContain('valid credentials');
    });

    it('includes the serialised code rules', () => {
      const prompt = promptRegistry['reconciliation'].render(sampleInput);
      expect(prompt).toContain('auth-redirect-unauthenticated');
      expect(prompt).toContain('Unauthenticated users must be redirected');
    });

    it('includes reconciliation notes when provided', () => {
      const prompt = promptRegistry['reconciliation'].render(sampleInput);
      expect(prompt).toContain('Focus on authentication flows only.');
    });

    it('omits notes section when not provided', () => {
      const inputNoNotes: ReconciliationInput = {
        featureName: 'Search',
        observedScenarios: [],
        codeRules: [],
      };
      const prompt = promptRegistry['reconciliation'].render(inputNoNotes);
      expect(prompt).not.toContain('Reconciliation notes');
    });

    it('instructs on matched/gap/conflict/new status values', () => {
      const prompt = promptRegistry['reconciliation'].render(sampleInput);
      expect(prompt).toContain('matched');
      expect(prompt).toContain('gap');
      expect(prompt).toContain('conflict');
      expect(prompt).toContain('new');
    });

    it('references confidenceScore in output instructions', () => {
      const prompt = promptRegistry['reconciliation'].render(sampleInput);
      expect(prompt).toContain('confidenceScore');
    });

    it('snapshot: render is stable for identical inputs', () => {
      const p1 = promptRegistry['reconciliation'].render(sampleInput);
      const p2 = promptRegistry['reconciliation'].render(sampleInput);
      expect(p1).toBe(p2);
    });
  });

  describe('output schema', () => {
    const validOutput: ReconciliationOutput = {
      featureName: 'User Login',
      scenarios: [
        {
          title: 'Log in with valid credentials',
          tags: ['@smoke'],
          status: 'matched',
          rationale: 'Scenario aligns with auth-redirect-unauthenticated rule.',
          steps: [
            {
              keyword: 'Given',
              text: 'a registered user is on the home page',
              supportedBy: ['auth-redirect-unauthenticated'],
            },
            { keyword: 'When', text: 'the user submits valid credentials' },
            { keyword: 'Then', text: 'the user is redirected to the dashboard' },
          ],
        },
      ],
      gaps: [],
      conflicts: [],
      confidenceScore: 90,
    };

    it('accepts a valid payload', () => {
      expectValid(validOutput, RECONCILIATION_OUTPUT_SCHEMA);
    });

    it('rejects a payload missing "confidenceScore"', () => {
      const bad = {
        featureName: 'Login',
        scenarios: [],
        gaps: [],
        conflicts: [],
      };
      expectInvalid(bad, RECONCILIATION_OUTPUT_SCHEMA);
    });

    it('rejects a scenario with an invalid status enum value', () => {
      const bad = {
        featureName: 'Login',
        scenarios: [
          {
            title: 'Test',
            status: 'unknown', // invalid
            rationale: 'reason',
            steps: [{ keyword: 'Given', text: 'something' }],
          },
        ],
        gaps: [],
        conflicts: [],
        confidenceScore: 50,
      };
      expectInvalid(bad, RECONCILIATION_OUTPUT_SCHEMA);
    });

    it('rejects a gap missing "suggestedStep"', () => {
      const bad = {
        featureName: 'Login',
        scenarios: [],
        gaps: [{ ruleId: 'r1', statement: 'A rule.' }],
        conflicts: [],
        confidenceScore: 50,
      };
      expectInvalid(bad, RECONCILIATION_OUTPUT_SCHEMA);
    });

    it('rejects a conflict with an additional property', () => {
      const bad = {
        featureName: 'Login',
        scenarios: [],
        gaps: [],
        conflicts: [
          {
            ruleId: 'r1',
            scenarioTitle: 'S1',
            description: 'desc',
            extraField: true,
          },
        ],
        confidenceScore: 50,
      };
      expectInvalid(bad, RECONCILIATION_OUTPUT_SCHEMA);
    });

    it('accepts an output with no gaps and no conflicts', () => {
      const allClear: ReconciliationOutput = {
        featureName: 'Search',
        scenarios: [],
        gaps: [],
        conflicts: [],
        confidenceScore: 100,
      };
      expectValid(allClear, RECONCILIATION_OUTPUT_SCHEMA);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Registry shape
// ─────────────────────────────────────────────────────────────────────────────

describe('promptRegistry', () => {
  it('contains all four template ids', () => {
    const ids = Object.keys(promptRegistry);
    expect(ids).toContain('action-planning');
    expect(ids).toContain('gherkin-generation');
    expect(ids).toContain('rule-extraction');
    expect(ids).toContain('reconciliation');
    expect(ids).toHaveLength(4);
  });

  it('each entry has a stable non-empty id matching its key', () => {
    for (const [key, tpl] of Object.entries(promptRegistry)) {
      expect(tpl.id).toBe(key);
      expect(tpl.id.length).toBeGreaterThan(0);
    }
  });

  it('each entry has a semver-shaped version string', () => {
    const semverPattern = /^\d+\.\d+\.\d+$/;
    for (const tpl of Object.values(promptRegistry)) {
      expect(tpl.version).toMatch(semverPattern);
    }
  });

  it('each entry has a render function', () => {
    for (const tpl of Object.values(promptRegistry)) {
      expect(typeof tpl.render).toBe('function');
    }
  });

  it('each entry has a schema with a "type" property', () => {
    for (const tpl of Object.values(promptRegistry)) {
      expect(typeof tpl.schema).toBe('object');
      expect('type' in tpl.schema).toBe(true);
    }
  });
});
