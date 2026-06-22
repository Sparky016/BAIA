import { Component, computed, inject, OnDestroy, OnInit } from '@angular/core';
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

  readonly phases = ['exploring', 'analyzing', 'reconciling', 'review', 'done'] as const;

  protected readonly currentOperation = computed(() => {
    const events = this.store.events();
    const last = [...events].reverse().find(e => e.type !== 'screenshot');
    return last ? last.message : 'Waiting for pipeline to start…';
  });

  protected readonly stepCount = computed(() =>
    this.store.events().filter(e => e.type === 'action').length
  );

  protected readonly hasError = computed(() =>
    this.store.status() === RunStatus.Failed ||
    this.store.events().some(e => e.type === 'error')
  );

  protected readonly phaseIndex = computed(() =>
    this.phases.indexOf(this.store.status() as typeof this.phases[number])
  );

  protected readonly visibleEvents = computed(() =>
    this.store.events().filter(e => e.type !== 'screenshot')
  );

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
      const exploreEvent = event as ExploreEvent;
      if (exploreEvent.type === 'screenshot') {
        if (exploreEvent.screenshotBase64) {
          this.store.setLatestScreenshot(exploreEvent.screenshotBase64);
        }
      } else {
        this.store.appendEvent(exploreEvent);
      }
    }
  }

  protected phaseClass(phase: string, index: number): Record<string, boolean> {
    const status = this.store.status();
    const pIdx = this.phaseIndex();
    return {
      active: phase === status,
      done: pIdx > 0 && index < pIdx,
    };
  }
}
