# DEV_TASK_34 — S7-03: API client services
**Status:** ✅ Complete

**Section:** S7 — Frontend: Shell, Input, Progress
**Model tier:** S → Sonnet 4.6, medium effort
**Size:** S
**Depends on:** DEV_TASK_2
**PRD ref:** §3 (FE↔BE), §6.1

## Goal
Typed Angular services for the runs/export REST API and the SSE progress stream.

## Files to create / edit
- `baia-ui/src/app/core/api/runs-api.service.ts` — `createRun`, `getRun`, `export` via `HttpClient`; DTOs from `baia-shared`.
- `baia-ui/src/app/core/api/run-events.service.ts` — `EventSource` client for `/runs/:id/events`; surfaces typed `ExploreEvent`s.

## Acceptance criteria
- Specs via `HttpTestingController`: success + error handling for each call; SSE service parses + emits events (mocked `EventSource`).
- Global gates (PLAN.md §A7).

## Out of scope
Components.

## Deliverable
Code + tests + completion report (PLAN.md §A4).
