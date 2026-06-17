import { BusinessRule } from './BusinessRule';
import { GherkinDoc } from './Gherkin';
import { RunStatus } from './RunStatus';

export interface RunSummary {
  runId: string;
  status: RunStatus;
  targetUrl: string;
  gherkinDoc?: GherkinDoc;
  businessRules?: BusinessRule[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}
