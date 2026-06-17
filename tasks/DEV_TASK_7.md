# DEV_TASK_7 — S1-02: Run state machine

**Section:** S1 — Backend Core & API Contract
**Model tier:** O → Opus 4.8, high effort
**Size:** M
**Depends on:** DEV_TASK_2, DEV_TASK_6
**PRD ref:** §2 (two phases), §4.3 (review/export)

## Goal
Design a typed state machine for the run lifecycle with guarded transitions and emitted events — the backbone every phase plugs into.

## Files to create / edit
- `baia-server/src/runs/run-state-machine.ts` — states from `RunStatus` (baia-shared); transition table; guard rejecting illegal transitions; `onTransition` event emission `{ runId, from, to, at }`.
- Types for transition events (add to `baia-shared` if shared with FE/SSE).

## Acceptance criteria
- All legal transitions succeed; **every illegal transition is rejected** with a typed error.
- Terminal states (`done`, `failed`) accept no further transitions.
- Tests: exhaustive transition matrix (legal + illegal), event emission order. **≥90% lines** (core-logic module).
- Global gates (PLAN.md §A7).

## Out of scope
HTTP, SSE transport (DEV_TASK_8/9); phase logic.

## Deliverable
Code + tests + completion report (PLAN.md §A4).
