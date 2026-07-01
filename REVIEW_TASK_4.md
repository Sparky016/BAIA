# Task 4 (P1): SSE Reliability — Heartbeat, Stall Detection, Reconnect, Cancel

## Problem

Today, a genuinely stalled backend and a merely slow-but-working one look identical to the user, and there is no way to escape either:

1. **No SSE heartbeat/keepalive** from the backend (`runs.sse.controller.ts`) — the stream only emits when a real pipeline event occurs, so a long gap between events (e.g. a slow LLM call) is indistinguishable from a dead connection.
2. **No reconnect logic in the frontend.** `progress.component.ts:146-148`:
   ```ts
   this.eventSource.onerror = () => {
     this.disconnect();
   };
   ```
   On any SSE error (network blip, server restart), the connection is simply torn down with no retry and no message to the user — the store is never told an error occurred.
3. **No stall detection.** `progress.component.ts` tracks and displays elapsed time per phase, but never compares it against an expected/typical duration, so there is no "this is taking unusually long" signal — the countdown just keeps climbing with no context.
4. **No way to cancel a running pipeline.** Once `POST /runs/:id/start` is called, there is no cancel/abort endpoint and no UI affordance for it. Combined with (1)-(3), a user who realizes they entered the wrong URL/instructions, or who simply gives up waiting, has no way to stop the run — they can only navigate away, which does not stop the backend job.

## Implementation Notes

### Backend

1. **Heartbeat:** in `runs.sse.controller.ts`, interleave a periodic comment/ping frame (e.g. `: keepalive\n\n` every 15–20s, standard SSE comment syntax so it's ignored by `EventSource`'s `onmessage` but keeps the connection alive and provides a signal the frontend *can* watch for) using `merge`/`interval` on the existing Observable.
2. **Cancel endpoint:** add `POST /api/runs/:id/cancel`. Requires:
   - A way for orchestrators to observe cancellation mid-loop — simplest approach: store an `AbortController`/cancellation flag per run in `RunsService` (or a new `RunCancellationService`), check it at the top of the explore loop (`explore.orchestrator.ts`'s `for` loop) and before/after each LLM call in `analyze`/`reconcile`, and treat a cancellation the same way as the `max_steps`/timeout exit from Task 3 (clean teardown, transition to a terminal state — either reuse `Failed` with a `cancelled: true` detail, or add a new `RunStatus.Cancelled` to the state machine if the existing 6-state machine should stay semantically clean).
   - Playwright teardown must still run (`finally { await this.runner.teardown(); }` already exists — cancellation must go through the same path, not bypass it).

### Frontend

3. **Reconnect with backoff:** in `progress.component.ts`, replace the bare `disconnect()` on `onerror` with an exponential-backoff reconnect (e.g. 1s, 2s, 4s, capped, up to N attempts) that re-subscribes to `/api/runs/:id/events`, and surface a transient "Reconnecting…" banner to `RunStore` while retrying. Only show a hard error after retries are exhausted.
4. **Stall warning:** compare `elapsedSeconds` in the current phase against a soft threshold (e.g. configurable per phase, or a single generic "this is taking longer than usual" threshold like 90s) and show a non-blocking warning banner — this does not need to be exact, just needs to exist so the user isn't left guessing.
5. **Cancel button:** add a "Cancel run" button on the progress page, calling the new cancel endpoint, with a confirmation step (this is a destructive, hard-to-reverse action from the user's perspective — losing in-progress exploration). On success, navigate back to `/input` or show a clear "Run cancelled" state rather than silently landing nowhere.

## Acceptance Criteria

- [ ] SSE stream sends periodic keepalive frames; a real network drop is distinguishable from a quiet-but-alive pipeline within one heartbeat interval.
- [ ] Frontend automatically retries a dropped SSE connection with backoff and shows a "reconnecting" state before giving up.
- [ ] Progress page shows a stall warning if a phase runs materially longer than expected, instead of silently continuing to count up.
- [ ] `POST /api/runs/:id/cancel` exists, is documented in Swagger, stops the in-flight Playwright/LLM work, tears down the browser cleanly, and puts the run in a terminal state with a clear reason.
- [ ] Progress page has a "Cancel run" affordance wired to the new endpoint, with a confirmation prompt before cancelling.
- [ ] New tests cover: SSE reconnect behavior, cancel-mid-explore-loop behavior, cancel-during-LLM-call behavior.

## Affected Files

- `baia-server/src/runs/runs.sse.controller.ts`, `baia-server/src/runs/runs.events.ts`
- New: cancellation plumbing in `baia-server/src/runs/` (service + state machine update if `RunStatus.Cancelled` is added) — check `baia-shared/src/models/RunStatus.ts` and `run-state-machine.ts` if a new status is introduced.
- `baia-server/src/explore/explore.orchestrator.ts`, `analyze.orchestrator.ts`, `reconcile.orchestrator.ts` (cancellation checks)
- `baia-ui/src/app/progress/progress.component.ts`, `.html`
- `baia-ui/src/app/core/api/*`, `baia-ui/src/app/core/state/run.store.ts`
