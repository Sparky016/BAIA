export type StepProvenance = 'ui' | 'code' | 'merged';

export interface GherkinStep {
  keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
  text: string;
  provenance: StepProvenance;
}

export interface GherkinScenario {
  name: string;
  steps: GherkinStep[];
  /** Set when reconciliation identifies a contradiction between this scenario and a code rule. */
  conflictNote?: string;
}

export interface GherkinFeature {
  name: string;
  description?: string;
  scenarios: GherkinScenario[];
}

export interface GherkinDoc {
  features: GherkinFeature[];
  generatedAt: Date;
}
