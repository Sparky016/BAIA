import { RunStatus } from '@baia/shared';

import { RunTransitionEvent } from './run-events.types';
import { Clock, IllegalRunTransitionError, RunStateMachine } from './run-state-machine';

/**
 * The single source of truth for the expected lifecycle, mirrored here so the
 * test asserts the table independently of the implementation's internal copy.
 */
const LEGAL: Record<RunStatus, RunStatus[]> = {
  [RunStatus.Queued]: [RunStatus.Exploring, RunStatus.Failed],
  [RunStatus.Exploring]: [RunStatus.Analyzing, RunStatus.Failed],
  [RunStatus.Analyzing]: [RunStatus.Reconciling, RunStatus.Failed],
  [RunStatus.Reconciling]: [RunStatus.Review, RunStatus.Failed],
  [RunStatus.Review]: [RunStatus.Exporting, RunStatus.Failed],
  [RunStatus.Exporting]: [RunStatus.Done, RunStatus.Failed],
  [RunStatus.Done]: [],
  [RunStatus.Failed]: [],
};

const ALL_STATES = Object.values(RunStatus);
const RUN_ID = 'run-123';

describe('RunStateMachine', () => {
  let machine: RunStateMachine;
  const fixedNow = 1_700_000_000_000;
  const clock: Clock = () => fixedNow;

  beforeEach(() => {
    machine = new RunStateMachine(clock);
  });

  describe('static states()', () => {
    it('exposes exactly the RunStatus values', () => {
      expect(RunStateMachine.states()).toEqual(ALL_STATES);
    });
  });

  describe('allowedTransitions()', () => {
    it.each(ALL_STATES)('matches the table for "%s"', (from) => {
      expect(machine.allowedTransitions(from)).toEqual(LEGAL[from]);
    });
  });

  describe('isTerminal()', () => {
    it.each(ALL_STATES)('classifies "%s" correctly', (state) => {
      const expected = state === RunStatus.Done || state === RunStatus.Failed;
      expect(machine.isTerminal(state)).toBe(expected);
    });
  });

  describe('exhaustive transition matrix', () => {
    // Cartesian product of every (from, to) pair across all states.
    for (const from of ALL_STATES) {
      for (const to of ALL_STATES) {
        const legal = LEGAL[from].includes(to);

        if (legal) {
          it(`allows legal transition ${from} -> ${to}`, () => {
            expect(machine.canTransition(from, to)).toBe(true);
            const event = machine.transition(RUN_ID, from, to);
            expect(event).toEqual({ runId: RUN_ID, from, to, at: fixedNow });
          });
        } else {
          it(`rejects illegal transition ${from} -> ${to}`, () => {
            expect(machine.canTransition(from, to)).toBe(false);
            expect(() => machine.transition(RUN_ID, from, to)).toThrow(IllegalRunTransitionError);
          });
        }
      }
    }
  });

  describe('typed error', () => {
    it('throws IllegalRunTransitionError carrying from/to', () => {
      let caught: unknown;
      try {
        machine.transition(RUN_ID, RunStatus.Queued, RunStatus.Done);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(IllegalRunTransitionError);
      const typed = caught as IllegalRunTransitionError;
      expect(typed.from).toBe(RunStatus.Queued);
      expect(typed.to).toBe(RunStatus.Done);
      expect(typed.name).toBe('IllegalRunTransitionError');
      expect(typed.message).toContain('queued');
      expect(typed.message).toContain('done');
    });

    it('is a real Error subclass with a usable stack', () => {
      const err = new IllegalRunTransitionError(RunStatus.Review, RunStatus.Queued);
      expect(err).toBeInstanceOf(Error);
      expect(err.stack).toBeDefined();
    });
  });

  describe('terminal-state rejection', () => {
    const terminals = [RunStatus.Done, RunStatus.Failed];

    it.each(terminals)('rejects every transition out of terminal "%s"', (from) => {
      expect(machine.allowedTransitions(from)).toEqual([]);
      for (const to of ALL_STATES) {
        expect(machine.canTransition(from, to)).toBe(false);
        expect(() => machine.transition(RUN_ID, from, to)).toThrow(IllegalRunTransitionError);
      }
    });
  });

  describe('onTransition event emission', () => {
    it('emits a well-formed event on a successful transition', () => {
      const events: RunTransitionEvent[] = [];
      machine.onTransition((e) => events.push(e));

      machine.transition(RUN_ID, RunStatus.Queued, RunStatus.Exploring);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        runId: RUN_ID,
        from: RunStatus.Queued,
        to: RunStatus.Exploring,
        at: fixedNow,
      });
    });

    it('does NOT emit when a transition is rejected', () => {
      const listener = jest.fn();
      machine.onTransition(listener);

      expect(() => machine.transition(RUN_ID, RunStatus.Queued, RunStatus.Done)).toThrow(
        IllegalRunTransitionError
      );

      expect(listener).not.toHaveBeenCalled();
    });

    it('invokes multiple listeners in registration order', () => {
      const calls: string[] = [];
      machine.onTransition(() => calls.push('first'));
      machine.onTransition(() => calls.push('second'));
      machine.onTransition(() => calls.push('third'));

      machine.transition(RUN_ID, RunStatus.Queued, RunStatus.Exploring);

      expect(calls).toEqual(['first', 'second', 'third']);
    });

    it('emits events in lifecycle order across a full happy-path run', () => {
      const seen: Array<[RunStatus, RunStatus]> = [];
      machine.onTransition((e) => seen.push([e.from, e.to]));

      const path: RunStatus[] = [
        RunStatus.Queued,
        RunStatus.Exploring,
        RunStatus.Analyzing,
        RunStatus.Reconciling,
        RunStatus.Review,
        RunStatus.Exporting,
        RunStatus.Done,
      ];
      for (let i = 0; i < path.length - 1; i++) {
        machine.transition(RUN_ID, path[i], path[i + 1]);
      }

      expect(seen).toEqual([
        [RunStatus.Queued, RunStatus.Exploring],
        [RunStatus.Exploring, RunStatus.Analyzing],
        [RunStatus.Analyzing, RunStatus.Reconciling],
        [RunStatus.Reconciling, RunStatus.Review],
        [RunStatus.Review, RunStatus.Exporting],
        [RunStatus.Exporting, RunStatus.Done],
      ]);
    });

    it('stops notifying a listener after unsubscribe', () => {
      const listener = jest.fn();
      const unsubscribe = machine.onTransition(listener);

      machine.transition(RUN_ID, RunStatus.Queued, RunStatus.Exploring);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      machine.transition(RUN_ID, RunStatus.Exploring, RunStatus.Analyzing);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe is idempotent and does not remove other listeners', () => {
      const a = jest.fn();
      const b = jest.fn();
      const unsubscribeA = machine.onTransition(a);
      machine.onTransition(b);

      unsubscribeA();
      unsubscribeA(); // second call is a no-op

      machine.transition(RUN_ID, RunStatus.Queued, RunStatus.Exploring);

      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledTimes(1);
    });

    it('tolerates a listener unsubscribing itself mid-dispatch', () => {
      const order: string[] = [];
      const unsubscribeSelf = machine.onTransition(() => {
        order.push('self');
        unsubscribeSelf();
      });
      machine.onTransition(() => order.push('other'));

      machine.transition(RUN_ID, RunStatus.Queued, RunStatus.Exploring);
      expect(order).toEqual(['self', 'other']);

      // Self-listener removed; only 'other' fires next time.
      order.length = 0;
      machine.transition(RUN_ID, RunStatus.Exploring, RunStatus.Analyzing);
      expect(order).toEqual(['other']);
    });
  });

  describe('default clock', () => {
    it('stamps events with Date.now() when no clock is injected', () => {
      const defaultMachine = new RunStateMachine();
      const before = Date.now();
      const event = defaultMachine.transition(RUN_ID, RunStatus.Queued, RunStatus.Exploring);
      const after = Date.now();

      expect(event.at).toBeGreaterThanOrEqual(before);
      expect(event.at).toBeLessThanOrEqual(after);
    });
  });
});
