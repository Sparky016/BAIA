import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { BusinessRule, ExploreEvent, GherkinDoc, RunSummary, UnifiedDoc } from '@baia/shared';
import { Injectable, Logger } from '@nestjs/common';

import { RunTransitionEvent } from '../runs/run-events.types';

type AnyEvent = ExploreEvent | RunTransitionEvent;

const RUN_ID_PATTERN = /^run-\d{4,}$/;
const OUTPUT_DIR = path.join(process.cwd(), 'output');

@Injectable()
export class OutputWriterService {
  private readonly logger = new Logger(OutputWriterService.name);

  private runDir(runId: string): string {
    this.validateRunId(runId);
    return path.join(OUTPUT_DIR, runId);
  }

  private validateRunId(runId: string): void {
    if (!RUN_ID_PATTERN.test(runId)) {
      throw new Error(`Invalid runId for output path: "${runId}"`);
    }
  }

  async initRun(runId: string, summary: RunSummary): Promise<void> {
    const dir = this.runDir(runId);
    await fs.mkdir(path.join(dir, 'screenshots'), { recursive: true });
    await fs.writeFile(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  }

  async updateRunSummary(
    runId: string,
    patch: Partial<Pick<RunSummary, 'status' | 'updatedAt'>>
  ): Promise<void> {
    const summaryPath = path.join(this.runDir(runId), 'summary.json');
    try {
      const raw = await fs.readFile(summaryPath, 'utf-8');
      const summary = JSON.parse(raw) as RunSummary;
      const updated = { ...summary, ...patch };
      await fs.writeFile(summaryPath, JSON.stringify(updated, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error(`Failed to update run summary for ${runId}: ${err}`);
    }
  }

  async appendEvent(runId: string, event: AnyEvent): Promise<void> {
    const eventsPath = path.join(this.runDir(runId), 'events.ndjson');
    await fs.appendFile(eventsPath, JSON.stringify(event) + '\n', 'utf-8');
  }

  async saveScreenshot(runId: string, step: number, _url: string, data: Buffer): Promise<void> {
    const stepStr = String(step).padStart(3, '0');
    const screenshotPath = path.join(this.runDir(runId), 'screenshots', `step-${stepStr}.png`);
    await fs.writeFile(screenshotPath, data);
  }

  async saveGherkinDoc(runId: string, doc: GherkinDoc): Promise<void> {
    await fs.writeFile(
      path.join(this.runDir(runId), 'gherkin.json'),
      JSON.stringify(doc, null, 2),
      'utf-8'
    );
  }

  async saveBusinessRules(runId: string, rules: BusinessRule[]): Promise<void> {
    await fs.writeFile(
      path.join(this.runDir(runId), 'business-rules.json'),
      JSON.stringify(rules, null, 2),
      'utf-8'
    );
  }

  async saveUnifiedDoc(runId: string, doc: UnifiedDoc): Promise<void> {
    await fs.writeFile(
      path.join(this.runDir(runId), 'unified-doc.json'),
      JSON.stringify(doc, null, 2),
      'utf-8'
    );
  }
}
