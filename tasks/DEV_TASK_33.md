# DEV_TASK_33 — S7-02: NgRx SignalStore (run state)
**Status:** ✅ Complete

**Section:** S7 — Frontend: Shell, Input, Progress
**Model tier:** S+ → Sonnet 4.6, high effort
**Size:** M
**Depends on:** DEV_TASK_2
**PRD ref:** §6.1 state management (RxJS/NgRx)

## Goal
Central run-state store: current run, status, progress events, unified doc, selectors + actions.

## Files to create / edit
- `baia-ui/src/app/core/state/run.store.ts` — NgRx SignalStore: state (runId, status `RunStatus`, events[], doc, error); methods to set/append; computed selectors (isRunning, canExport).
- Add `@ngrx/signals` dependency.

## Acceptance criteria
- Store specs cover all state transitions + computed selectors.
- Types sourced from `baia-shared`.
- Global gates (PLAN.md §A7).

## Out of scope
HTTP/SSE (DEV_TASK_34); components.

## Deliverable
Code + tests + completion report (PLAN.md §A4).
