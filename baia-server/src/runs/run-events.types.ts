import { RunStatus } from '@baia/shared';

/**
 * Emitted whenever the run state machine performs a successful transition.
 *
 * NOTE: Defined locally in `src/runs/` for now. A later task promotes this
 * shape into `@baia/shared` once SSE / the frontend consume it (DEV_TASK_8/9).
 */
export interface RunTransitionEvent {
  /** Identifier of the run whose state changed. */
  readonly runId: string;
  /** State the run transitioned out of. */
  readonly from: RunStatus;
  /** State the run transitioned into. */
  readonly to: RunStatus;
  /** Timestamp (epoch milliseconds) at which the transition occurred. */
  readonly at: number;
}

/** Listener invoked on every successful transition. */
export type RunTransitionListener = (event: RunTransitionEvent) => void;
