import { RunStatus } from './RunStatus';
import { GherkinDoc } from './Gherkin';
import { BusinessRule } from './BusinessRule';

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
