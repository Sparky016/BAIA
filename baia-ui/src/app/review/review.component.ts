import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { RunStore } from '../core/state/run.store';
import { GherkinEditorComponent } from './gherkin-editor.component';
import { ExportPanelComponent } from './export-panel.component';

@Component({
  selector: 'app-review',
  standalone: true,
  imports: [CommonModule, GherkinEditorComponent, ExportPanelComponent],
  templateUrl: './review.component.html',
})
export class ReviewComponent {
  protected readonly store = inject(RunStore);
  protected readonly route = inject(ActivatedRoute);
  protected readonly runId = this.route.snapshot.params['id'] ?? '';

  get isApproved(): boolean {
    return this.store.approved();
  }

  get canExport(): boolean {
    return this.store.canExport();
  }

  approve(): void {
    this.store.approve();
  }

  get exportTooltip(): string {
    if (this.isApproved) return 'Ready to export';
    return 'Review and approve the Gherkin before exporting';
  }
}
