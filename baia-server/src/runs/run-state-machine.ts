import { RunStatus } from '@baia/shared';
import { Injectable } from '@nestjs/common';

import { RunTransitionEvent, RunTransitionListener } from './run-events.types';

/**
 * Error thrown when an illegal run-state transition is attempted.
 *
 * Typed (not a bare `Error`) so callers can `instanceof`-discriminate guard
 * failures from other runtime errors.
 */
export class IllegalRunTransitionError extends Error {
  public readonly from: RunStatus;
  public readonly to: RunStatus;

  constructor(from: RunStatus, to: RunStatus) {
    super(`Illegal run transition: "${from}" -> "${to}".`);
    this.name = 'IllegalRunTransitionError';
    this.from = from;
    this.to = to;

    // Restore prototype chain (TypeScript downlevel-extends caveat) so
    // `instanceof IllegalRunTransitionError` holds for callers.
    Object.setPrototypeOf(this, IllegalRunTransitionError.prototype);
  }
}

/**
 * Explicit transition table for the run lifecycle.
 *
 * Lifecycle (PRD §2 two phases, §4.3 review/export):
 *   queued → exploring → analyzing → reconciling → review → exporting → done
 * Any non-terminal state may also transition to `failed`.
 * Terminal states (`done`, `failed`) accept no further transitions.
 *
 * Every `RunStatus` has an entry; terminal states map to an empty set. The
 * table is the single source of truth — `canTransition` and `transition`
 * consult it, and the test matrix is derived from it exhaustively.
 */
const TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  [RunStatus.Queued]: [RunStatus.Exploring, RunStatus.Failed],
  [RunStatus.Exploring]: [RunStatus.Analyzing, RunStatus.Failed],
  [RunStatus.Analyzing]: [RunStatus.Reconciling, RunStatus.Failed],
  [RunStatus.Reconciling]: [RunStatus.Review, RunStatus.Failed],
  [RunStatus.Review]: [RunStatus.Exporting, RunStatus.Failed],
  [RunStatus.Exporting]: [RunStatus.Done, RunStatus.Failed],
  [RunStatus.Done]: [],
  [RunStatus.Failed]: [],
};

/** States from which no transition is permitted. */
const TERMINAL_STATES: ReadonlySet<RunStatus> = new Set([RunStatus.Done, RunStatus.Failed]);

/** Injectable clock — overridable in tests for deterministic timestamps. */
export type Clock = () => number;

/**
 * Typed, guarded state machine for the run lifecycle.
 *
 * Stateless with respect to any individual run: callers own the current
 * `RunStatus` and pass it in. The machine validates the requested transition
 * against the explicit table, rejects illegal transitions with a typed error,
 * and emits a `RunTransitionEvent` to all registered listeners on success.
 */
@Injectable()
export class RunStateMachine {
  private readonly listeners: RunTransitionListener[] = [];

  constructor(private readonly clock: Clock = () => Date.now()) {}

  /** All run states known to the machine. */
  static states(): readonly RunStatus[] {
    return Object.values(RunStatus);
  }

  /** Legal target states reachable from `from` (empty for terminal states). */
  allowedTransitions(from: RunStatus): readonly RunStatus[] {
    return TRANSITIONS[from];
  }

  /** True when `state` is terminal (`done` / `failed`). */
  isTerminal(state: RunStatus): boolean {
    return TERMINAL_STATES.has(state);
  }

  /** True when transitioning `from` → `to` is permitted by the table. */
  canTransition(from: RunStatus, to: RunStatus): boolean {
    return TRANSITIONS[from].includes(to);
  }

  /**
   * Register a listener invoked (in registration order) on every successful
   * transition. Returns an unsubscribe function.
   */
  onTransition(listener: RunTransitionListener): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Perform a guarded transition for `runId` from `from` to `to`.
   *
   * @returns the emitted `RunTransitionEvent` on success.
   * @throws {IllegalRunTransitionError} if the transition is not in the table
   *   (this includes every attempt out of a terminal state).
   */
  transition(runId: string, from: RunStatus, to: RunStatus): RunTransitionEvent {
    if (!this.canTransition(from, to)) {
      throw new IllegalRunTransitionError(from, to);
    }

    const event: RunTransitionEvent = {
      runId,
      from,
      to,
      at: this.clock(),
    };

    this.emit(event);
    return event;
  }

  /** Dispatch an event to all listeners in registration order. */
  private emit(event: RunTransitionEvent): void {
    // Iterate a snapshot so a listener unsubscribing during dispatch does not
    // disturb the in-flight iteration.
    for (const listener of [...this.listeners]) {
      listener(event);
    }
  }
}
