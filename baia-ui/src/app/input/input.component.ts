import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { RunStore } from '../core/state/run.store';
import { RunsApiService } from '../core/api/runs-api.service';
import { RunRequest, RunStatus } from '@baia/shared';

@Component({
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './input.component.html',
})
export class InputComponent {
  private readonly fb = inject(FormBuilder);
  private readonly runsApi = inject(RunsApiService);
  protected readonly store = inject(RunStore);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    targetUrl: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
    instructions: ['', Validators.required],
    repoUrl: [''],
    repoProvider: [''],
    credentialsRef: [''],
  });

  isSubmitting = false;
  submitError: string | null = null;

  submit(): void {
    if (this.form.invalid || this.isSubmitting) return;
    this.isSubmitting = true;
    this.submitError = null;

    const value = this.form.getRawValue();
    const request: RunRequest = {
      targetUrl: value.targetUrl,
      instructions: value.instructions,
      ...(value.repoUrl ? { repoUrl: value.repoUrl } : {}),
      ...(value.repoProvider ? { repoProvider: value.repoProvider as 'github' | 'azure' } : {}),
      ...(value.credentialsRef ? { credentialsRef: value.credentialsRef } : {}),
    };

    this.runsApi.createRun(request).subscribe({
      next: (run) => {
        this.store.setRunWithRequest(run.runId, run.status ?? RunStatus.Queued, request);
        void this.router.navigate(['/progress', run.runId]);
      },
      error: (err: Error) => {
        this.submitError = err.message ?? 'Failed to start BAIA';
        this.isSubmitting = false;
      },
    });
  }
}
