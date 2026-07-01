import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RunStore } from '../core/state/run.store';
import { GherkinDoc } from '@baia/shared';

@Component({
  selector: 'app-gherkin-editor',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './gherkin-editor.component.html',
})
export class GherkinEditorComponent implements OnInit {
  protected readonly store = inject(RunStore);
  protected editableDoc: GherkinDoc | null = null;

  ngOnInit(): void {
    const doc = this.store.activeDoc();
    this.editableDoc = doc ? this.deepCopy(doc) : null;
  }

  updateStepText(featureIdx: number, scenarioIdx: number, stepIdx: number, text: string): void {
    if (!this.editableDoc) return;
    const step = this.editableDoc.features[featureIdx]?.scenarios[scenarioIdx]?.steps[stepIdx];
    if (step) {
      step.text = text;
      this.store.updateGherkinDoc(this.deepCopy(this.editableDoc));
    }
  }

  updateFeatureName(featureIdx: number, name: string): void {
    if (!this.editableDoc) return;
    const feature = this.editableDoc.features[featureIdx];
    if (feature) {
      feature.name = name;
      this.store.updateGherkinDoc(this.deepCopy(this.editableDoc));
    }
  }

  updateScenarioName(featureIdx: number, scenarioIdx: number, name: string): void {
    if (!this.editableDoc) return;
    const scenario = this.editableDoc.features[featureIdx]?.scenarios[scenarioIdx];
    if (scenario) {
      scenario.name = name;
      this.store.updateGherkinDoc(this.deepCopy(this.editableDoc));
    }
  }

  provenanceTitle(provenance: string): string {
    const titles: Record<string, string> = {
      ui: 'Observed in the live browser session',
      code: 'Extracted from source code',
      merged: 'Confirmed by both browser observation and source code',
      conflict: 'Browser observation and source code contradict each other',
    };
    return titles[provenance] ?? provenance;
  }

  private deepCopy(doc: GherkinDoc): GherkinDoc {
    return JSON.parse(JSON.stringify(doc));
  }
}
