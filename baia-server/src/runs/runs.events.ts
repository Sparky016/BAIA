import { ExploreEvent, RunStatus } from '@baia/shared';
import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import { RunTransitionEvent } from './run-events.types';

/**
 * Union of all event types that can be pushed into the SSE stream for a run.
 *
 * `RunTransitionEvent` carries state-machine transitions (status changes).
 * `ExploreEvent` carries real-time phase events (actions, observations, etc.)
 * produced by the explore phase service.
 *
 * Defined locally in `src/runs/`; shared promotion happens in a later wave.
 */
export type RunStreamEvent = RunTransitionEvent | ExploreEvent;

/** Terminal `RunStatus` values — stream completes when any of these are seen. */
const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set([RunStatus.Done, RunStatus.Failed]);

/**
 * Per-run event bus that bridges the state machine + phase services to SSE.
 *
 * Maintains one `Subject` per active `runId`. Callers:
 *   - `emit(runId, event)` — push an event (creates the subject on first call).
 *   - `stream(runId)`     — subscribe to the hot observable for that run.
 *   - `complete(runId)`   — complete and remove the subject (terminal states).
 *
 * `emit` auto-completes the stream when the event is a `RunTransitionEvent`
 * whose `to` field is a terminal status, so callers do not need to call
 * `complete` separately after emitting a terminal transition.
 */
@Injectable()
export class RunsEventsService {
  /** Live subjects keyed by runId. */
  private readonly subjects = new Map<string, Subject<RunStreamEvent>>();

  /**
   * Emit `event` on the subject for `runId`, creating the subject if absent.
   *
   * After emission, if the event is a state-machine transition into a terminal
   * status, the subject is completed and removed from the registry.
   */
  emit(runId: string, event: RunStreamEvent): void {
    const subject = this.getOrCreate(runId);

    // Only emit if the subject is still open (not already completed).
    if (subject.closed) {
      return;
    }

    subject.next(event);

    if (this.isTerminalTransition(event)) {
      this.complete(runId);
    }
  }

  /**
   * Return a cold-subscribable `Observable` for events emitted on `runId`.
   *
   * If no subject exists yet, one is created so the subscriber can receive
   * events that are emitted after subscription (the common case when the client
   * opens the SSE connection before any transitions have fired).
   */
  stream(runId: string): Observable<RunStreamEvent> {
    return this.getOrCreate(runId).asObservable();
  }

  /**
   * Complete and remove the subject for `runId`.
   *
   * Safe to call multiple times — subsequent calls are no-ops.
   *
   * The subject is removed from the registry **before** `subject.complete()`
   * is called, because RxJS completion is synchronous: observer callbacks run
   * immediately inside `complete()`.  Deleting first ensures that any observer
   * that checks `activeStreams` inside its `complete` handler sees the updated
   * count.
   */
  complete(runId: string): void {
    const subject = this.subjects.get(runId);
    // Remove from registry first so activeStreams is correct when observers fire.
    this.subjects.delete(runId);
    if (subject && !subject.closed) {
      subject.complete();
    }
  }

  /** Number of currently active (non-completed) run streams. */
  get activeStreams(): number {
    return this.subjects.size;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getOrCreate(runId: string): Subject<RunStreamEvent> {
    let subject = this.subjects.get(runId);
    if (!subject || subject.closed) {
      subject = new Subject<RunStreamEvent>();
      this.subjects.set(runId, subject);
    }
    return subject;
  }

  /**
   * True when `event` is a `RunTransitionEvent` whose target state is terminal.
   *
   * The discriminator is the presence of `from`/`to`/`at` (shape of
   * `RunTransitionEvent`) combined with a terminal `to` value.  `ExploreEvent`
   * does not have a `to` property.
   */
  private isTerminalTransition(event: RunStreamEvent): boolean {
    return (
      'to' in event && 'from' in event && TERMINAL_STATUSES.has((event as RunTransitionEvent).to)
    );
  }
}
