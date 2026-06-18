import { MessageEvent } from '@nestjs/common';
import { ExploreEvent, RunStatus } from '@baia/shared';
import { firstValueFrom, Subject, toArray } from 'rxjs';
import { take } from 'rxjs/operators';

import { RunTransitionEvent } from './run-events.types';
import { RunStreamEvent, RunsEventsService } from './runs.events';
import { RunsSseController } from './runs.sse.controller';

const RUN_ID = 'run-sse-test';

/** Build a RunTransitionEvent for test use. */
function makeTransition(from: RunStatus, to: RunStatus): RunTransitionEvent {
  return { runId: RUN_ID, from, to, at: 1_700_000_000_000 };
}

/** Build an ExploreEvent for test use. */
function makeExploreEvent(type: ExploreEvent['type'] = 'action', message = 'msg'): ExploreEvent {
  return { timestamp: new Date('2024-01-01T00:00:00Z'), type, message };
}

/**
 * Minimal mock of RunsEventsService that lets us control the subject directly.
 */
class MockRunsEventsService {
  private subjects = new Map<string, Subject<RunStreamEvent>>();

  getSubject(runId: string): Subject<RunStreamEvent> {
    let subject = this.subjects.get(runId);
    if (!subject) {
      subject = new Subject<RunStreamEvent>();
      this.subjects.set(runId, subject);
    }
    return subject;
  }

  stream(runId: string): Subject<RunStreamEvent> {
    return this.getSubject(runId);
  }

  emit(runId: string, event: RunStreamEvent): void {
    this.getSubject(runId).next(event);
  }

  complete(runId: string): void {
    const subject = this.subjects.get(runId);
    if (subject) {
      subject.complete();
      this.subjects.delete(runId);
    }
  }
}

describe('RunsSseController', () => {
  let controller: RunsSseController;
  let mockService: MockRunsEventsService;

  beforeEach(() => {
    mockService = new MockRunsEventsService();
    controller = new RunsSseController(mockService as unknown as RunsEventsService);
  });

  // ---------------------------------------------------------------------------
  // streamEvents() return type & wrapper
  // ---------------------------------------------------------------------------

  describe('streamEvents()', () => {
    it('returns an Observable', () => {
      const obs = controller.streamEvents(RUN_ID);
      expect(obs).toBeDefined();
      expect(typeof obs.subscribe).toBe('function');
    });

    it('wraps each event in a MessageEvent with a data property', (done) => {
      const exploreEvent = makeExploreEvent('action', 'navigate');

      controller
        .streamEvents(RUN_ID)
        .pipe(take(1))
        .subscribe({
          next: (msg: MessageEvent) => {
            expect(msg).toHaveProperty('data');
            expect(msg.data).toEqual(exploreEvent);
            done();
          },
        });

      mockService.emit(RUN_ID, exploreEvent);
    });

    it('wraps RunTransitionEvent in a MessageEvent', (done) => {
      const transitionEvent = makeTransition(RunStatus.Queued, RunStatus.Exploring);

      controller
        .streamEvents(RUN_ID)
        .pipe(take(1))
        .subscribe({
          next: (msg: MessageEvent) => {
            expect(msg.data).toEqual(transitionEvent);
            done();
          },
        });

      mockService.emit(RUN_ID, transitionEvent);
    });
  });

  // ---------------------------------------------------------------------------
  // Event ordering
  // ---------------------------------------------------------------------------

  describe('event ordering', () => {
    it('delivers events in the exact order they are emitted', async () => {
      const events: RunStreamEvent[] = [
        makeTransition(RunStatus.Queued, RunStatus.Exploring),
        makeExploreEvent('action', 'step 1'),
        makeExploreEvent('observation', 'step 2'),
        makeExploreEvent('action', 'step 3'),
      ];

      const obs$ = controller.streamEvents(RUN_ID).pipe(take(4), toArray());
      const resultPromise = firstValueFrom(obs$);

      for (const e of events) {
        mockService.emit(RUN_ID, e);
      }

      const messages = await resultPromise;
      expect(messages).toHaveLength(4);

      for (let i = 0; i < events.length; i++) {
        expect(messages[i].data).toEqual(events[i]);
      }
    });

    it('delivers a mixed sequence of transitions and explore events in order', async () => {
      const sequence: RunStreamEvent[] = [
        makeTransition(RunStatus.Queued, RunStatus.Exploring),
        makeExploreEvent('action', 'navigate to home'),
        makeExploreEvent('observation', 'home page loaded'),
        makeTransition(RunStatus.Exploring, RunStatus.Analyzing),
        makeExploreEvent('complete', 'phase done'),
      ];

      const obs$ = controller.streamEvents(RUN_ID).pipe(take(5), toArray());
      const resultPromise = firstValueFrom(obs$);

      for (const e of sequence) {
        mockService.emit(RUN_ID, e);
      }

      const messages = await resultPromise;
      expect(messages.map((m: MessageEvent) => m.data)).toEqual(sequence);
    });
  });

  // ---------------------------------------------------------------------------
  // Stream completion on terminal state
  // ---------------------------------------------------------------------------

  describe('stream completion', () => {
    it('completes when the underlying service completes on Done', (done) => {
      const received: MessageEvent[] = [];

      controller.streamEvents(RUN_ID).subscribe({
        next: (msg) => received.push(msg),
        complete: () => {
          expect(received).toHaveLength(2);
          expect((received[0].data as RunTransitionEvent).to).toBe(RunStatus.Exploring);
          expect((received[1].data as RunTransitionEvent).to).toBe(RunStatus.Done);
          done();
        },
      });

      mockService.emit(RUN_ID, makeTransition(RunStatus.Queued, RunStatus.Exploring));
      mockService.emit(RUN_ID, makeTransition(RunStatus.Exploring, RunStatus.Done));
      mockService.complete(RUN_ID);
    });

    it('completes when the underlying service completes on Failed', (done) => {
      const received: MessageEvent[] = [];

      controller.streamEvents(RUN_ID).subscribe({
        next: (msg) => received.push(msg),
        complete: () => {
          expect(received).toHaveLength(1);
          expect((received[0].data as RunTransitionEvent).to).toBe(RunStatus.Failed);
          done();
        },
      });

      mockService.emit(RUN_ID, makeTransition(RunStatus.Queued, RunStatus.Failed));
      mockService.complete(RUN_ID);
    });

    it('propagates completion through a full happy-path lifecycle', (done) => {
      const transitions: RunTransitionEvent[] = [
        makeTransition(RunStatus.Queued, RunStatus.Exploring),
        makeTransition(RunStatus.Exploring, RunStatus.Analyzing),
        makeTransition(RunStatus.Analyzing, RunStatus.Reconciling),
        makeTransition(RunStatus.Reconciling, RunStatus.Review),
        makeTransition(RunStatus.Review, RunStatus.Exporting),
        makeTransition(RunStatus.Exporting, RunStatus.Done),
      ];

      const received: MessageEvent[] = [];

      controller.streamEvents(RUN_ID).subscribe({
        next: (msg) => received.push(msg),
        complete: () => {
          expect(received).toHaveLength(6);

          const statuses = received.map((m) => (m.data as RunTransitionEvent).to);
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

      for (const t of transitions) {
        mockService.emit(RUN_ID, t);
      }
      mockService.complete(RUN_ID);
    });
  });

  // ---------------------------------------------------------------------------
  // Run-ID routing
  // ---------------------------------------------------------------------------

  describe('run-ID routing', () => {
    it('passes the :id param to eventsService.stream()', (done) => {
      const targetId = 'specific-run-999';
      const event = makeExploreEvent('action', 'routed');

      // We need a subject for targetId
      controller
        .streamEvents(targetId)
        .pipe(take(1))
        .subscribe({
          next: (msg: MessageEvent) => {
            expect(msg.data).toEqual(event);
            done();
          },
        });

      // Emit only on the correct run ID
      mockService.emit(targetId, event);
    });
  });
});
