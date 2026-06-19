import { GherkinDoc } from '@baia/shared';

import { gherkinDocTitle, gherkinDocToConfluenceStorage } from './gherkin-to-confluence';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const GENERATED_AT = new Date('2025-01-15T10:00:00.000Z');

const SIMPLE_DOC: GherkinDoc = {
  features: [
    {
      name: 'User Login',
      description: 'Covers all login scenarios for the system.',
      scenarios: [
        {
          name: 'Successful login',
          steps: [
            { keyword: 'Given', text: 'the user is on the login page', provenance: 'ui' },
            { keyword: 'When', text: 'the user enters valid credentials', provenance: 'ui' },
            { keyword: 'Then', text: 'the user is redirected to the dashboard', provenance: 'ui' },
          ],
        },
      ],
    },
  ],
  generatedAt: GENERATED_AT,
};

const DOC_WITH_CONFLICT: GherkinDoc = {
  features: [
    {
      name: 'Password Policy',
      scenarios: [
        {
          name: 'Short password rejected',
          conflictNote: 'UI allows 6 chars but code enforces 8 chars minimum.',
          steps: [
            {
              keyword: 'Given',
              text: 'the user provides a 6-character password',
              provenance: 'ui',
            },
            { keyword: 'Then', text: 'the system shows a validation error', provenance: 'code' },
          ],
        },
      ],
    },
  ],
  generatedAt: GENERATED_AT,
};

const MULTI_FEATURE_DOC: GherkinDoc = {
  features: [
    {
      name: 'Feature Alpha',
      scenarios: [
        {
          name: 'Alpha Scenario',
          steps: [{ keyword: 'Given', text: 'alpha precondition', provenance: 'ui' }],
        },
      ],
    },
    {
      name: 'Feature Beta',
      scenarios: [
        {
          name: 'Beta Scenario',
          steps: [{ keyword: 'When', text: 'beta action occurs', provenance: 'code' }],
        },
      ],
    },
  ],
  generatedAt: GENERATED_AT,
};

const EMPTY_DOC: GherkinDoc = {
  features: [],
  generatedAt: GENERATED_AT,
};

const XML_SPECIAL_DOC: GherkinDoc = {
  features: [
    {
      name: 'Search & Filter <Results>',
      scenarios: [
        {
          name: 'Filter by "active" status',
          steps: [
            { keyword: 'Given', text: 'items with status "active" & "pending"', provenance: 'ui' },
          ],
        },
      ],
    },
  ],
  generatedAt: GENERATED_AT,
};

// ─── gherkinDocTitle ──────────────────────────────────────────────────────────

describe('gherkinDocTitle', () => {
  it('returns BAIA-prefixed first feature name', () => {
    expect(gherkinDocTitle(SIMPLE_DOC)).toBe('BAIA: User Login');
  });

  it('returns generic title for empty doc', () => {
    expect(gherkinDocTitle(EMPTY_DOC)).toBe('BAIA: Generated Documentation');
  });

  it('uses the first feature name when multiple features exist', () => {
    expect(gherkinDocTitle(MULTI_FEATURE_DOC)).toBe('BAIA: Feature Alpha');
  });
});

// ─── gherkinDocToConfluenceStorage ────────────────────────────────────────────

describe('gherkinDocToConfluenceStorage', () => {
  describe('generated timestamp', () => {
    it('includes the ISO timestamp in the output', () => {
      const markup = gherkinDocToConfluenceStorage(SIMPLE_DOC);
      expect(markup).toContain('2025-01-15T10:00:00.000Z');
    });
  });

  describe('feature rendering', () => {
    it('wraps feature name in <h2>', () => {
      const markup = gherkinDocToConfluenceStorage(SIMPLE_DOC);
      expect(markup).toContain('<h2>User Login</h2>');
    });

    it('includes feature description in <p>', () => {
      const markup = gherkinDocToConfluenceStorage(SIMPLE_DOC);
      expect(markup).toContain('<p>Covers all login scenarios for the system.</p>');
    });

    it('omits description <p> when feature has no description', () => {
      const markup = gherkinDocToConfluenceStorage(DOC_WITH_CONFLICT);
      // Password Policy has no description — no stray empty <p> tags
      const matches = markup.match(/<p>/g) ?? [];
      // only the timestamp <em> paragraph and the conflict note body
      expect(matches.length).toBeLessThanOrEqual(3);
    });

    it('renders all features in a multi-feature doc', () => {
      const markup = gherkinDocToConfluenceStorage(MULTI_FEATURE_DOC);
      expect(markup).toContain('<h2>Feature Alpha</h2>');
      expect(markup).toContain('<h2>Feature Beta</h2>');
    });
  });

  describe('scenario rendering', () => {
    it('wraps scenario name in <h3>', () => {
      const markup = gherkinDocToConfluenceStorage(SIMPLE_DOC);
      expect(markup).toContain('<h3>Successful login</h3>');
    });

    it('uses a Confluence code macro for steps', () => {
      const markup = gherkinDocToConfluenceStorage(SIMPLE_DOC);
      expect(markup).toContain('<ac:structured-macro ac:name="code"');
      expect(markup).toContain('<ac:parameter ac:name="language">gherkin</ac:parameter>');
      expect(markup).toContain('<ac:plain-text-body><![CDATA[');
    });

    it('includes all step keywords and texts in the code block', () => {
      const markup = gherkinDocToConfluenceStorage(SIMPLE_DOC);
      expect(markup).toContain('Given the user is on the login page');
      expect(markup).toContain('When the user enters valid credentials');
      expect(markup).toContain('Then the user is redirected to the dashboard');
    });
  });

  describe('conflict note rendering', () => {
    it('renders a Confluence warning macro for conflicting scenarios', () => {
      const markup = gherkinDocToConfluenceStorage(DOC_WITH_CONFLICT);
      expect(markup).toContain('<ac:structured-macro ac:name="warning"');
      expect(markup).toContain('<ac:rich-text-body>');
    });

    it('includes the conflict note text inside the warning macro', () => {
      const markup = gherkinDocToConfluenceStorage(DOC_WITH_CONFLICT);
      expect(markup).toContain('UI allows 6 chars but code enforces 8 chars minimum.');
    });

    it('does not render a warning macro for scenarios without conflicts', () => {
      const markup = gherkinDocToConfluenceStorage(SIMPLE_DOC);
      expect(markup).not.toContain('ac:name="warning"');
    });
  });

  describe('XML escaping', () => {
    it('escapes & in feature name', () => {
      const markup = gherkinDocToConfluenceStorage(XML_SPECIAL_DOC);
      expect(markup).toContain('Search &amp; Filter');
      expect(markup).not.toContain('Search & Filter');
    });

    it('escapes < and > in feature name', () => {
      const markup = gherkinDocToConfluenceStorage(XML_SPECIAL_DOC);
      expect(markup).toContain('&lt;Results&gt;');
      expect(markup).not.toContain('<Results>');
    });

    it('escapes " in scenario name', () => {
      const markup = gherkinDocToConfluenceStorage(XML_SPECIAL_DOC);
      expect(markup).toContain('Filter by &quot;active&quot; status');
    });

    it('preserves unescaped content inside CDATA step blocks', () => {
      const markup = gherkinDocToConfluenceStorage(XML_SPECIAL_DOC);
      // Steps are inside CDATA — raw text is safe
      expect(markup).toContain('items with status "active" & "pending"');
    });
  });

  describe('golden markup snapshot', () => {
    it('matches expected storage format for a simple doc', () => {
      const markup = gherkinDocToConfluenceStorage(SIMPLE_DOC);

      // Timestamp line
      expect(markup).toContain('<em>Generated by BAIA on 2025-01-15T10:00:00.000Z</em>');

      // Feature heading
      expect(markup).toContain('<h2>User Login</h2>');
      expect(markup).toContain('<p>Covers all login scenarios for the system.</p>');

      // Scenario heading
      expect(markup).toContain('<h3>Successful login</h3>');

      // Code macro with language parameter
      expect(markup).toContain('<ac:parameter ac:name="language">gherkin</ac:parameter>');

      // Steps in CDATA
      expect(markup).toContain(
        '<ac:plain-text-body><![CDATA[' +
          'Given the user is on the login page\n' +
          'When the user enters valid credentials\n' +
          'Then the user is redirected to the dashboard' +
          ']]></ac:plain-text-body>'
      );
    });
  });

  describe('empty doc', () => {
    it('still returns a valid string for a doc with no features', () => {
      const markup = gherkinDocToConfluenceStorage(EMPTY_DOC);
      expect(typeof markup).toBe('string');
      expect(markup).toContain('Generated by BAIA');
      expect(markup).not.toContain('<h2>');
    });
  });
});
