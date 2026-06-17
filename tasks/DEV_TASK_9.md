# DEV_TASK_9 — S1-04: SSE progress stream

**Section:** S1 — Backend Core & API Contract
**Model tier:** S+ → Sonnet 4.6, high effort
**Size:** M
**Depends on:** DEV_TASK_7
**PRD ref:** §5 (Progress view), §3 (orchestrator workflow)

## Goal
Stream run progress to the frontend in real time via Server-Sent Events, bridging state-machine + phase events.

## Files to create / edit
- `baia-server/src/runs/runs.events.ts` — event bus (RxJS Subject per run) fed by the state machine and phase services.
- `baia-server/src/runs/runs.sse.controller.ts` — `GET /runs/:id/events` (SSE) streaming `ExploreEvent`/status events.
- Event DTOs in `baia-shared` if not already present.

## Acceptance criteria
- Client receives events **in order** as transitions/phase events occur.
- Stream completes/closes on terminal state.
- Tests: simulate transitions, assert streamed event sequence + close.
- Global gates (PLAN.md §A7).

## Out of scope
Real phase event producers (later sections emit into the bus).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
