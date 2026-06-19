import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RunStore } from '../core/state/run.store';
import { RunsApiService } from '../core/api/runs-api.service';

@Component({
  selector: 'app-export-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './export-panel.component.html',
})
export class ExportPanelComponent {
  @Input() runId: string = '';

  protected readonly store = inject(RunStore);
  private readonly runsApi = inject(RunsApiService);

  baseUrl: string = '';
  spaceKey: string = '';
  credentialsRef: string = '';
  exportUrl: string | null = null;
  exportError: string | null = null;
  isExporting: boolean = false;

  get canExport(): boolean {
    return (
      this.store.canExport() &&
      this.baseUrl.trim() !== '' &&
      this.spaceKey.trim() !== '' &&
      this.credentialsRef.trim() !== ''
    );
  }

  export(): void {
    this.isExporting = true;
    this.runsApi
      .export(this.runId, {
        baseUrl: this.baseUrl,
        spaceKey: this.spaceKey,
        credentialsRef: this.credentialsRef,
      })
      .subscribe({
        next: (result) => {
          this.exportUrl = result.url;
          this.exportError = null;
          this.isExporting = false;
        },
        error: (error: Error) => {
          this.exportError = error.message ?? 'Export failed';
          this.exportUrl = null;
          this.isExporting = false;
        },
      });
  }
}
