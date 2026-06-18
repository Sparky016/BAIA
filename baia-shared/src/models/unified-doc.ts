import type { StepProvenance } from './Gherkin';

export interface DocConflict {
  scenarioName: string;
  ruleRef?: string;
  description: string;
}

export interface UnifiedStep {
  keyword: 'Given' | 'When' | 'Then' | 'And' | 'But';
  text: string;
  provenance: StepProvenance;
  ruleRefs?: string[];
}

export interface UnifiedScenario {
  name: string;
  steps: UnifiedStep[];
  conflicts?: DocConflict[];
}

export interface UnifiedFeature {
  name: string;
  description?: string;
  scenarios: UnifiedScenario[];
}

export interface UnifiedDoc {
  features: UnifiedFeature[];
  conflicts: DocConflict[];
  generatedAt: Date;
  sourceRunId?: string;
}
