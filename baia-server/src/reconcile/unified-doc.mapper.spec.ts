import { DocConflict, GherkinDoc, UnifiedDoc } from '@baia/shared';

import { UnifiedDocMapper } from './unified-doc.mapper';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const GENERATED_AT = new Date('2024-06-01T12:00:00.000Z');

const BASE_DOC: GherkinDoc = {
  features: [
    {
      name: 'Authentication',
      description: 'Login and logout flows',
      scenarios: [
        {
          name: 'Successful login',
          steps: [
            { keyword: 'Given', text: 'the user is on the login page', provenance: 'ui' },
            { keyword: 'When', text: 'the user enters valid credentials', provenance: 'merged' },
            { keyword: 'Then', text: 'the user is redirected to the dashboard', provenance: 'merged' },
          ],
        },
        {
          name: 'Code Rule: auth::rule-1',
          steps: [
            { keyword: 'Given', text: 'the system enforces: must authenticate', provenance: 'code' },
            { keyword: 'When', text: 'the user performs the related action', provenance: 'code' },
            { keyword: 'Then', text: 'access is granted only with valid session', provenance: 'code' },
          ],
        },
      ],
    },
  ],
  generatedAt: GENERATED_AT,
};

const CONFLICT_DOC: GherkinDoc = {
  features: [
    {
      name: 'Admin Access',
      scenarios: [
        {
          name: 'Admin bypasses authentication',
          steps: [
            { keyword: 'Given', text: 'the admin is on the dashboard', provenance: 'ui' },
            { keyword: 'When', text: 'the admin accesses without login', provenance: 'ui' },
            { keyword: 'Then', text: 'the dashboard is displayed', provenance: 'ui' },
          ],
          conflictNote: 'Contradicts mandatory authentication rule',
        },
      ],
    },
  ],
  generatedAt: GENERATED_AT,
};

const TOP_CONFLICTS: DocConflict[] = [
  {
    scenarioName: 'Admin bypasses authentication',
    ruleRef: 'auth::rule-1',
    description: 'UI scenario contradicts code rule requiring authentication',
  },
];

// ─── fromGherkinDoc ───────────────────────────────────────────────────────────

describe('UnifiedDocMapper.fromGherkinDoc', () => {
  it('maps feature names and descriptions', () => {
    const doc = UnifiedDocMapper.fromGherkinDoc(BASE_DOC);
    expect(doc.features[0].name).toBe('Authentication');
    expect(doc.features[0].description).toBe('Login and logout flows');
  });

  it('maps scenario names', () => {
    const doc = UnifiedDocMapper.fromGherkinDoc(BASE_DOC);
    expect(doc.features[0].scenarios[0].name).toBe('Successful login');
    expect(doc.features[0].scenarios[1].name).toBe('Code Rule: auth::rule-1');
  });

  it('preserves step keyword and text', () => {
    const doc = UnifiedDocMapper.fromGherkinDoc(BASE_DOC);
    const steps = doc.features[0].scenarios[0].steps;
    expect(steps[0].keyword).toBe('Given');
    expect(steps[0].text).toBe('the user is on the login page');
    expect(steps[1].keyword).toBe('When');
    expect(steps[2].keyword).toBe('Then');
  });

  it('preserves provenance on all steps', () => {
    const doc = UnifiedDocMapper.fromGherkinDoc(BASE_DOC);
    const steps = doc.features[0].scenarios[0].steps;
    expect(steps[0].provenance).toBe('ui');
    expect(steps[1].provenance).toBe('merged');
    expect(steps[2].provenance).toBe('merged');
  });

  it('preserves "code" provenance on gap scenarios', () => {
    const doc = UnifiedDocMapper.fromGherkinDoc(BASE_DOC);
    const codeSteps = doc.features[0].scenarios[1].steps;
    expect(codeSteps.every((s) => s.provenance === 'code')).toBe(true);
  });

  it('sets generatedAt from the source GherkinDoc', () => {
    const doc = UnifiedDocMapper.fromGherkinDoc(BASE_DOC);
    expect(doc.generatedAt).toEqual(GENERATED_AT);
  });

  it('defaults conflicts to empty array when none provided', () => {
    const doc = UnifiedDocMapper.fromGherkinDoc(BASE_DOC);
    expect(doc.conflicts).toEqual([]);
  });

  it('attaches provided top-level conflicts to the document root', () => {
    const doc = UnifiedDocMapper.fromGherkinDoc(CONFLICT_DOC, TOP_CONFLICTS);
    expect(doc.conflicts).toHaveLength(1);
    expect(doc.conflicts[0].ruleRef).toBe('auth::rule-1');
    expect(doc.conflicts[0].scenarioName).toBe('Admin bypasses authentication');
  });

  it('promotes scenario conflictNote to scenario-level DocConflict', () => {
    const doc = UnifiedDocMapper.fromGherkinDoc(CONFLICT_DOC);
    const scenario = doc.features[0].scenarios[0];
    expect(scenario.conflicts).toHaveLength(1);
    expect(scenario.conflicts![0].description).toBe('Contradicts mandatory authentication rule');
    expect(scenario.conflicts![0].scenarioName).toBe('Admin bypasses authentication');
  });

  it('leaves conflicts undefined on scenarios without conflictNote', () => {
    const doc = UnifiedDocMapper.fromGherkinDoc(BASE_DOC);
    expect(doc.features[0].scenarios[0].conflicts).toBeUndefined();
  });

  it('handles a GherkinDoc with no features', () => {
    const emptyDoc: GherkinDoc = { features: [], generatedAt: GENERATED_AT };
    const doc = UnifiedDocMapper.fromGherkinDoc(emptyDoc);
    expect(doc.features).toEqual([]);
    expect(doc.conflicts).toEqual([]);
  });

  it('handles features with no description', () => {
    const doc = UnifiedDocMapper.fromGherkinDoc(CONFLICT_DOC);
    expect(doc.features[0].description).toBeUndefined();
  });

  it('does not set ruleRefs on steps when building from a GherkinDoc', () => {
    const doc = UnifiedDocMapper.fromGherkinDoc(BASE_DOC);
    const steps = doc.features[0].scenarios[0].steps;
    expect(steps.every((s) => s.ruleRefs === undefined)).toBe(true);
  });
});

// ─── serialise / deserialise round-trip ──────────────────────────────────────

describe('UnifiedDocMapper serialise / deserialise', () => {
  it('round-trips a minimal UnifiedDoc with equality', () => {
    const source = UnifiedDocMapper.fromGherkinDoc(BASE_DOC);
    const revived = UnifiedDocMapper.deserialise(UnifiedDocMapper.serialise(source));

    expect(revived.features[0].name).toBe(source.features[0].name);
    expect(revived.features[0].scenarios[0].name).toBe(source.features[0].scenarios[0].name);
    expect(revived.conflicts).toEqual(source.conflicts);
  });

  it('revives generatedAt as a Date instance', () => {
    const source = UnifiedDocMapper.fromGherkinDoc(BASE_DOC);
    const revived = UnifiedDocMapper.deserialise(UnifiedDocMapper.serialise(source));

    expect(revived.generatedAt).toBeInstanceOf(Date);
    expect(revived.generatedAt.toISOString()).toBe(GENERATED_AT.toISOString());
  });

  it('preserves provenance through the round-trip', () => {
    const source = UnifiedDocMapper.fromGherkinDoc(BASE_DOC);
    const revived = UnifiedDocMapper.deserialise(UnifiedDocMapper.serialise(source));

    const steps = revived.features[0].scenarios[0].steps;
    expect(steps[0].provenance).toBe('ui');
    expect(steps[1].provenance).toBe('merged');
    expect(steps[2].provenance).toBe('merged');
  });

  it('preserves ruleRefs through the round-trip', () => {
    const source: UnifiedDoc = {
      features: [
        {
          name: 'Auth',
          scenarios: [
            {
              name: 'Login',
              steps: [
                { keyword: 'Given', text: 'context', provenance: 'ui' },
                { keyword: 'When', text: 'action', provenance: 'merged', ruleRefs: ['auth::rule-1', 'auth::rule-2'] },
                { keyword: 'Then', text: 'outcome', provenance: 'merged', ruleRefs: ['auth::rule-1'] },
              ],
            },
          ],
        },
      ],
      conflicts: [],
      generatedAt: GENERATED_AT,
    };

    const revived = UnifiedDocMapper.deserialise(UnifiedDocMapper.serialise(source));
    const steps = revived.features[0].scenarios[0].steps;

    expect(steps[0].ruleRefs).toBeUndefined();
    expect(steps[1].ruleRefs).toEqual(['auth::rule-1', 'auth::rule-2']);
    expect(steps[2].ruleRefs).toEqual(['auth::rule-1']);
  });

  it('preserves top-level conflicts through the round-trip', () => {
    const source = UnifiedDocMapper.fromGherkinDoc(CONFLICT_DOC, TOP_CONFLICTS);
    const revived = UnifiedDocMapper.deserialise(UnifiedDocMapper.serialise(source));

    expect(revived.conflicts).toHaveLength(1);
    expect(revived.conflicts[0].ruleRef).toBe('auth::rule-1');
    expect(revived.conflicts[0].description).toBe(
      'UI scenario contradicts code rule requiring authentication',
    );
  });

  it('preserves scenario-level conflicts through the round-trip', () => {
    const source = UnifiedDocMapper.fromGherkinDoc(CONFLICT_DOC);
    const revived = UnifiedDocMapper.deserialise(UnifiedDocMapper.serialise(source));

    const conflicts = revived.features[0].scenarios[0].conflicts;
    expect(conflicts).toHaveLength(1);
    expect(conflicts![0].description).toBe('Contradicts mandatory authentication rule');
  });

  it('preserves sourceRunId through the round-trip', () => {
    const source: UnifiedDoc = {
      features: [],
      conflicts: [],
      generatedAt: GENERATED_AT,
      sourceRunId: 'run-abc-123',
    };

    const revived = UnifiedDocMapper.deserialise(UnifiedDocMapper.serialise(source));
    expect(revived.sourceRunId).toBe('run-abc-123');
  });

  it('round-trips a document with multiple features and scenarios', () => {
    const source: UnifiedDoc = {
      features: [
        {
          name: 'Feature A',
          scenarios: [
            {
              name: 'Scenario A1',
              steps: [
                { keyword: 'Given', text: 'ctx', provenance: 'ui', ruleRefs: ['r1'] },
                { keyword: 'When', text: 'act', provenance: 'ui' },
                { keyword: 'Then', text: 'out', provenance: 'code' },
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
                { keyword: 'Given', text: 'ctx2', provenance: 'merged', ruleRefs: ['r2', 'r3'] },
                { keyword: 'When', text: 'act2', provenance: 'merged' },
                { keyword: 'Then', text: 'out2', provenance: 'merged' },
              ],
              conflicts: [{ scenarioName: 'Scenario B1', ruleRef: 'r2', description: 'conflict desc' }],
            },
          ],
        },
      ],
      conflicts: [{ scenarioName: 'Scenario B1', ruleRef: 'r2', description: 'top-level conflict' }],
      generatedAt: GENERATED_AT,
      sourceRunId: 'run-xyz',
    };

    const revived = UnifiedDocMapper.deserialise(UnifiedDocMapper.serialise(source));

    expect(revived.features).toHaveLength(2);
    expect(revived.features[0].scenarios[0].steps[0].ruleRefs).toEqual(['r1']);
    expect(revived.features[1].scenarios[0].steps[0].ruleRefs).toEqual(['r2', 'r3']);
    expect(revived.features[1].scenarios[0].conflicts![0].ruleRef).toBe('r2');
    expect(revived.conflicts[0].description).toBe('top-level conflict');
    expect(revived.sourceRunId).toBe('run-xyz');
    expect(revived.generatedAt).toBeInstanceOf(Date);
  });

  it('serialise produces valid JSON string', () => {
    const source = UnifiedDocMapper.fromGherkinDoc(BASE_DOC);
    const json = UnifiedDocMapper.serialise(source);

    expect(typeof json).toBe('string');
    expect(() => JSON.parse(json)).not.toThrow();
  });
});
