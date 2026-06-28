import { ExploreEvent, RunStatus } from '@baia/shared';
import { firstValueFrom, toArray } from 'rxjs';
import { take } from 'rxjs/operators';

import { OutputWriterService } from '../output/output-writer.service';

import { RunTransitionEvent } from './run-events.types';
import { RunStreamEvent, RunsEventsService } from './runs.events';

const RUN_ID = 'run-abc-123';
const OTHER_RUN_ID = 'run-xyz-789';

/** Build a minimal RunTransitionEvent for test use. */
function makeTransition(from: RunStatus, to: RunStatus, runId = RUN_ID): RunTransitionEvent {
  return { runId, from, to, at: Date.now() };
}

/** Build a minimal ExploreEvent for test use. */
function makeExploreEvent(
  type: ExploreEvent['type'] = 'action',
  message = 'test message'
): ExploreEvent {
  return { timestamp: new Date(), type, message };
}

describe('RunsEventsService', () => {
  let service: RunsEventsService;

  beforeEach(() => {
    const mockOutputWriter = { appendEvent: jest.fn() } as unknown as OutputWriterService;
    service = new RunsEventsService(mockOutputWriter);
  });

  // ---------------------------------------------------------------------------
  // Basic emission and streaming
  // ---------------------------------------------------------------------------

  describe('emit() and stream()', () => {
    it('delivers a single RunTransitionEvent to a subscriber', (done) => {
      const event = makeTransition(RunStatus.Queued, RunStatus.Exploring);

      service
        .stream(RUN_ID)
        .pipe(take(1))
        .subscribe({
          next: (received) => {
            expect(received).toEqual(event);
            done();
          },
        });

      service.emit(RUN_ID, event);
    });

    it('delivers a single ExploreEvent to a subscriber', (done) => {
      const event = makeExploreEvent('observation', 'clicked button');

      service
        .stream(RUN_ID)
        .pipe(take(1))
        .subscribe({
          next: (received) => {
            expect(received).toEqual(event);
            done();
          },
        });

      service.emit(RUN_ID, event);
    });

    it('delivers multiple events in order', async () => {
      const events: RunStreamEvent[] = [
        makeTransition(RunStatus.Queued, RunStatus.Exploring),
        makeExploreEvent('action', 'navigate'),
        makeExploreEvent('observation', 'page loaded'),
      ];

      // Collect 3 events then complete
      const received$ = service.stream(RUN_ID).pipe(take(3), toArray());
      const receivedPromise = firstValueFrom(received$);

      for (const e of events) {
        service.emit(RUN_ID, e);
      }

      const received = await receivedPromise;
      expect(received).toHaveLength(3);
      expect(received).toEqual(events);
    });

    it('events arrive in the exact order they were emitted', async () => {
      const order: string[] = [];
      const collected: RunStreamEvent[] = [];

      // Subscribe and track order
      const sub = service.stream(RUN_ID).subscribe((e) => {
        if ('type' in e && !('from' in e)) {
          order.push((e as ExploreEvent).message);
        } else {
          order.push(`transition:${(e as RunTransitionEvent).to}`);
        }
        collected.push(e);
      });

      service.emit(RUN_ID, makeTransition(RunStatus.Queued, RunStatus.Exploring));
      service.emit(RUN_ID, makeExploreEvent('action', 'first'));
      service.emit(RUN_ID, makeExploreEvent('action', 'second'));
      service.emit(RUN_ID, makeExploreEvent('observation', 'third'));

      sub.unsubscribe();

      expect(order).toEqual(['transition:exploring', 'first', 'second', 'third']);
      expect(collected).toHaveLength(4);
    });
  });

  // ---------------------------------------------------------------------------
  // Terminal state auto-completion
  // ---------------------------------------------------------------------------

  describe('terminal state completion', () => {
    it('completes the stream when a Done transition is emitted', (done) => {
      const events: RunStreamEvent[] = [
        makeTransition(RunStatus.Queued, RunStatus.Exploring),
        makeTransition(RunStatus.Exploring, RunStatus.Done),
      ];

      const received: RunStreamEvent[] = [];

      service.stream(RUN_ID).subscribe({
        next: (e) => received.push(e),
        complete: () => {
          expect(received).toHaveLength(2);
          expect((received[1] as RunTransitionEvent).to).toBe(RunStatus.Done);
          done();
        },
      });

      for (const e of events) {
        service.emit(RUN_ID, e);
      }
    });

    it('completes the stream when a Failed transition is emitted', (done) => {
      const events: RunStreamEvent[] = [
        makeTransition(RunStatus.Queued, RunStatus.Exploring),
        makeTransition(RunStatus.Exploring, RunStatus.Failed),
      ];

      const received: RunStreamEvent[] = [];

      service.stream(RUN_ID).subscribe({
        next: (e) => received.push(e),
        complete: () => {
          expect(received).toHaveLength(2);
          expect((received[1] as RunTransitionEvent).to).toBe(RunStatus.Failed);
          done();
        },
      });

      for (const e of events) {
        service.emit(RUN_ID, e);
      }
    });

    it('streams all events before completion on a full happy-path run', (done) => {
      const transitions: RunTransitionEvent[] = [
        makeTransition(RunStatus.Queued, RunStatus.Exploring),
        makeTransition(RunStatus.Exploring, RunStatus.Analyzing),
        makeTransition(RunStatus.Analyzing, RunStatus.Reconciling),
        makeTransition(RunStatus.Reconciling, RunStatus.Review),
        makeTransition(RunStatus.Review, RunStatus.Exporting),
        makeTransition(RunStatus.Exporting, RunStatus.Done),
      ];

      const received: RunStreamEvent[] = [];

      service.stream(RUN_ID).subscribe({
        next: (e) => received.push(e),
        complete: () => {
          expect(received).toHaveLength(6);
          const statuses = (received as RunTransitionEvent[]).map((e) => e.to);
          expect(statuses).toEqual([
            RunStatus.Exploring,
            RunStatus.Analyzing,
            RunStatus.Reconciling,
            RunStatus.Review,
            RunStatus.Exporting,
            RunStatus.Done,
          ]);
          done();
        },
      });

      for (const e of transitions) {
        service.emit(RUN_ID, e);
      }
    });

    it('does NOT complete on non-terminal RunTransitionEvents', () => {
      let completed = false;
      const sub = service.stream(RUN_ID).subscribe({
        complete: () => {
          completed = true;
        },
      });

      service.emit(RUN_ID, makeTransition(RunStatus.Queued, RunStatus.Exploring));
      service.emit(RUN_ID, makeTransition(RunStatus.Exploring, RunStatus.Analyzing));

      expect(completed).toBe(false);

      sub.unsubscribe();
    });

    it('does NOT complete on ExploreEvents (even type=complete)', () => {
      let completed = false;
      const sub = service.stream(RUN_ID).subscribe({
        complete: () => {
          completed = true;
        },
      });

      // ExploreEvent with type='complete' should NOT close the stream
      service.emit(RUN_ID, makeExploreEvent('complete', 'phase done'));

      expect(completed).toBe(false);

      sub.unsubscribe();
    });
  });

  // ---------------------------------------------------------------------------
  // Isolation between runs
  // ---------------------------------------------------------------------------

  describe('run isolation', () => {
    it('events for different runIds do not cross-contaminate', async () => {
      const eventA = makeTransition(RunStatus.Queued, RunStatus.Exploring, RUN_ID);
      const eventB = makeTransition(RunStatus.Queued, RunStatus.Exploring, OTHER_RUN_ID);

      const receivedA: RunStreamEvent[] = [];
      const receivedB: RunStreamEvent[] = [];

      const subA = service.stream(RUN_ID).subscribe((e) => receivedA.push(e));
      const subB = service.stream(OTHER_RUN_ID).subscribe((e) => receivedB.push(e));

      service.emit(RUN_ID, eventA);
      service.emit(OTHER_RUN_ID, eventB);

      expect(receivedA).toHaveLength(1);
      expect(receivedA[0]).toEqual(eventA);
      expect(receivedB).toHaveLength(1);
      expect(receivedB[0]).toEqual(eventB);

      subA.unsubscribe();
      subB.unsubscribe();
    });

    it('completing one run does not affect another', (done) => {
      let otherCompleted = false;
      const subOther = service.stream(OTHER_RUN_ID).subscribe({
        complete: () => {
          otherCompleted = true;
        },
      });

      // Subscribe to main run and drive to completion
      service.stream(RUN_ID).subscribe({
        complete: () => {
          // After RUN_ID stream completes, OTHER_RUN_ID should still be open
          expect(otherCompleted).toBe(false);
          subOther.unsubscribe();
          done();
        },
      });

      service.emit(RUN_ID, makeTransition(RunStatus.Queued, RunStatus.Done));
    });
  });

  // ---------------------------------------------------------------------------
  // explicit complete() method
  // ---------------------------------------------------------------------------

  describe('complete()', () => {
    it('completes the stream when called manually', (done) => {
      service.stream(RUN_ID).subscribe({
        complete: () => done(),
      });

      service.complete(RUN_ID);
    });

    it('is idempotent — calling multiple times does not throw', () => {
      service.stream(RUN_ID);
      expect(() => {
        service.complete(RUN_ID);
        service.complete(RUN_ID);
        service.complete(RUN_ID);
      }).not.toThrow();
    });

    it('drops events emitted after completion', () => {
      const received: RunStreamEvent[] = [];
      const sub = service.stream(RUN_ID).subscribe((e) => received.push(e));

      service.emit(RUN_ID, makeExploreEvent('action', 'before complete'));
      service.complete(RUN_ID);
      service.emit(RUN_ID, makeExploreEvent('action', 'after complete'));

      sub.unsubscribe();

      expect(received).toHaveLength(1);
      expect((received[0] as ExploreEvent).message).toBe('before complete');
    });

    it('prevents emit() after complete() from resurrecting the stream', () => {
      const received: RunStreamEvent[] = [];
      const sub = service.stream(RUN_ID).subscribe((e) => received.push(e));

      service.emit(RUN_ID, makeExploreEvent('action', 'before complete'));
      const activeBeforeComplete = service.activeStreams;
      service.complete(RUN_ID);
      const activeAfterComplete = service.activeStreams;

      // Emit after complete — should not create a new subject
      service.emit(RUN_ID, makeExploreEvent('action', 'after complete resurrection attempt'));
      const activeAfterEmit = service.activeStreams;

      sub.unsubscribe();

      // Verify that:
      // 1. activeStreams goes from 1 → 0 after complete()
      expect(activeBeforeComplete).toBe(1);
      expect(activeAfterComplete).toBe(0);
      // 2. activeStreams stays at 0 after emit() — no resurrection
      expect(activeAfterEmit).toBe(0);
      // 3. No event was received after complete()
      expect(received).toHaveLength(1);
      expect((received[0] as ExploreEvent).message).toBe('before complete');
    });

    it('prevents emit() after terminal transition from resurrecting the stream', () => {
      const received: RunStreamEvent[] = [];
      const sub = service.stream(RUN_ID).subscribe((e) => received.push(e));

      service.emit(RUN_ID, makeTransition(RunStatus.Queued, RunStatus.Done));
      const activeAfterTerminal = service.activeStreams;

      // Emit after terminal transition — should not create a new subject
      service.emit(RUN_ID, makeExploreEvent('action', 'after terminal'));
      const activeAfterEmit = service.activeStreams;

      sub.unsubscribe();

      // Verify that activeStreams stays at 0
      expect(activeAfterTerminal).toBe(0);
      expect(activeAfterEmit).toBe(0);
      // Only the terminal transition was received
      expect(received).toHaveLength(1);
      expect((received[0] as RunTransitionEvent).to).toBe(RunStatus.Done);
    });
  });

  // ---------------------------------------------------------------------------
  // activeStreams tracking
  // ---------------------------------------------------------------------------

  describe('activeStreams', () => {
    it('starts at zero', () => {
      expect(service.activeStreams).toBe(0);
    });

    it('increments when a stream is created via stream()', () => {
      const sub = service.stream(RUN_ID).subscribe();
      expect(service.activeStreams).toBe(1);
      sub.unsubscribe();
    });

    it('increments when a stream is created via emit()', () => {
      service.emit(RUN_ID, makeExploreEvent());
      // subject was created by emit; still open (non-terminal event)
      expect(service.activeStreams).toBe(1);
    });

    it('decrements to zero after terminal completion', (done) => {
      service.stream(RUN_ID).subscribe({
        complete: () => {
          expect(service.activeStreams).toBe(0);
          done();
        },
      });

      expect(service.activeStreams).toBe(1);
      service.emit(RUN_ID, makeTransition(RunStatus.Queued, RunStatus.Done));
    });

    it('tracks multiple independent runs', () => {
      const sub1 = service.stream(RUN_ID).subscribe();
      const sub2 = service.stream(OTHER_RUN_ID).subscribe();

      expect(service.activeStreams).toBe(2);

      sub1.unsubscribe();
      sub2.unsubscribe();
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('stream() before any emit() receives events emitted afterward', (done) => {
      const expected = makeExploreEvent('action', 'late event');

      service
        .stream(RUN_ID)
        .pipe(take(1))
        .subscribe({
          next: (e) => {
            expect(e).toEqual(expected);
            done();
          },
        });

      // Emit after subscription (normal SSE client flow)
      service.emit(RUN_ID, expected);
    });

    it('emit() before stream() — late subscriber misses prior events (hot subject)', () => {
      // Subjects are hot; late subscribers do not receive replayed events.
      // This is documented expected behaviour.
      const received: RunStreamEvent[] = [];
      service.emit(RUN_ID, makeExploreEvent('action', 'early'));

      // Subscribe after the event was already emitted
      const sub = service.stream(RUN_ID).subscribe((e) => received.push(e));
      expect(received).toHaveLength(0);
      sub.unsubscribe();
    });

    it('multiple subscribers on the same runId all receive events', async () => {
      const receivedA: RunStreamEvent[] = [];
      const receivedB: RunStreamEvent[] = [];

      const subA = service.stream(RUN_ID).subscribe((e) => receivedA.push(e));
      const subB = service.stream(RUN_ID).subscribe((e) => receivedB.push(e));

      const event = makeExploreEvent('action', 'shared');
      service.emit(RUN_ID, event);

      expect(receivedA).toEqual([event]);
      expect(receivedB).toEqual([event]);

      subA.unsubscribe();
      subB.unsubscribe();
    });
  });
});
