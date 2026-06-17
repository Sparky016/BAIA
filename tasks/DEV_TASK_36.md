# DEV_TASK_36 — S7-05: Progress view

**Section:** S7 — Frontend: Shell, Input, Progress
**Model tier:** S+ → Sonnet 4.6, high effort
**Size:** M
**Depends on:** DEV_TASK_33, DEV_TASK_34
**PRD ref:** §6.1 (Progress route), §5 (reports errors)

## Goal
Live progress view subscribing to SSE, rendering the phase/step timeline and errors; navigates to review when status reaches `review`.

## Files to create / edit
- `baia-ui/src/app/progress/progress.component.ts/.html` — open SSE via `run-events.service`, push into the store, render status + ordered event timeline + errors; on `review` → navigate `review/:id`.

## Acceptance criteria
- Specs with mocked SSE: events render live in order; error events shown; transition to review navigates.
- Global gates (PLAN.md §A7).

## Out of scope
Review dashboard (S8).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
