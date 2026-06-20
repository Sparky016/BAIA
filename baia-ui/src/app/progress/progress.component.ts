import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ExploreEvent, RunStatus } from '@baia/shared';
import { RunsApiService } from '../core/api/runs-api.service';
import { RunStore } from '../core/state/run.store';

interface RunTransitionEvent {
  runId: string;
  from: RunStatus;
  to: RunStatus;
  at: number;
}

type RunStreamEvent = RunTransitionEvent | ExploreEvent;

@Component({
  selector: 'app-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './progress.component.html',
})
export class ProgressComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly store = inject(RunStore);
  private readonly runsApi = inject(RunsApiService);

  readonly runId: string = this.route.snapshot.params['id'] ?? '';
  private eventSource: EventSource | null = null;

  ngOnInit(): void {
    if (!this.runId) return;

    if (this.store.status() === RunStatus.Queued) {
      const request = this.store.request();
      if (request) {
        this.runsApi.startRun(this.runId, request).subscribe({
          error: (err: Error) =>
            this.store.setError(err.message ?? 'Failed to start pipeline'),
        });
      }
    }

    this.connect();
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  protected openEventSource(url: string): EventSource {
    return new EventSource(url);
  }

  private connect(): void {
    this.eventSource = this.openEventSource(`/api/runs/${this.runId}/events`);
    this.eventSource.onmessage = (ev: MessageEvent<string>) => {
      const data = JSON.parse(ev.data) as RunStreamEvent;
      this.handleEvent(data);
    };
    this.eventSource.onerror = () => {
      this.disconnect();
    };
  }

  private disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
  }

  private handleEvent(event: RunStreamEvent): void {
    if ('to' in event) {
      this.store.setStatus((event as RunTransitionEvent).to);
      if ((event as RunTransitionEvent).to === RunStatus.Review) {
        void this.router.navigate(['/review', this.runId]);
      }
    } else {
      this.store.appendEvent(event as ExploreEvent);
    }
  }
}
