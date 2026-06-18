import { BusinessRule } from './BusinessRule';
import { GherkinDoc } from './Gherkin';
import { RunStatus } from './RunStatus';
import { UnifiedDoc } from './unified-doc';

export interface RunSummary {
  runId: string;
  status: RunStatus;
  targetUrl: string;
  gherkinDoc?: GherkinDoc;
  businessRules?: BusinessRule[];
  unifiedDoc?: UnifiedDoc;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}
