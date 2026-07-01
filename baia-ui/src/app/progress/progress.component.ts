import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
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

  @ViewChild('eventsLog') private eventsLog?: ElementRef<HTMLDivElement>;

  readonly runId: string = this.route.snapshot.params['id'] ?? '';
  private eventSource: EventSource | null = null;
  private elapsedInterval: ReturnType<typeof setInterval> | null = null;
  private phaseStartedAt: number = Date.now();

  readonly phases = ['exploring', 'analyzing', 'reconciling', 'review', 'done'] as const;

  readonly elapsedSeconds = signal(0);
  private readonly phaseEventOffset = signal(0);

  protected readonly isRunning = computed(() => this.store.isRunning());

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

  protected readonly phaseEventsCount = computed(() =>
    this.store.events().length - this.phaseEventOffset()
  );

  protected readonly currentPhaseLabel = computed(() => {
    const s = this.store.status();
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  });

  private readonly phaseDescriptions: Record<string, string> = {
    exploring: 'Navigating the site and recording what happens',
    analyzing: 'Reading the source code for business rules',
    reconciling: 'Merging observed behavior with code-derived rules',
    review: 'Your turn to review and approve',
  };

  protected readonly currentPhaseDescription = computed(() => {
    const s = this.store.status();
    if (!s) return '';
    return this.phaseDescriptions[s] ?? '';
  });

  protected readonly elapsedDisplay = computed(() => {
    const s = this.elapsedSeconds();
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}m ${rem}s`;
  });

  constructor() {
    // Auto-scroll to bottom whenever visible events update.
    effect(() => {
      this.visibleEvents();
      Promise.resolve().then(() => {
        if (this.eventsLog?.nativeElement) {
          const el = this.eventsLog.nativeElement;
          el.scrollTop = el.scrollHeight;
        }
      });
    });
  }

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

    this.phaseStartedAt = Date.now();
    this.elapsedInterval = setInterval(() => {
      this.elapsedSeconds.set(Math.floor((Date.now() - this.phaseStartedAt) / 1000));
    }, 1000);

    this.connect();
  }

  ngOnDestroy(): void {
    this.disconnect();
    if (this.elapsedInterval) {
      clearInterval(this.elapsedInterval);
      this.elapsedInterval = null;
    }
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
      this.phaseStartedAt = Date.now();
      this.elapsedSeconds.set(0);
      this.phaseEventOffset.set(this.store.events().length);
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
      failed: status === RunStatus.Failed && phase === this.phases[pIdx >= 0 ? pIdx : 0],
    };
  }

  protected connectorClass(index: number): Record<string, boolean> {
    return { done: this.phaseIndex() > index };
  }
}
