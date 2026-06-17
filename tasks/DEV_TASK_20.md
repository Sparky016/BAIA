# DEV_TASK_20 — S3-06: Wire Phase 1 into runs

**Section:** S3 — Phase 1: Exploratory Analyst
**Model tier:** S → Sonnet 4.6, medium effort
**Size:** S
**Depends on:** DEV_TASK_7, DEV_TASK_17, DEV_TASK_19
**PRD ref:** §2 Phase 1, §3 orchestrator workflow

## Goal
Orchestrate the `exploring` state end to end: planner loop → capture → Gherkin, with progress events and failure handling.

## Files to create / edit
- `baia-server/src/explore/explore.orchestrator.ts` — on run start: transition `queued→exploring`, run planner+capture loop, generate Gherkin, store on the run, transition toward `analyzing`; on error → `failed` with event.

## Acceptance criteria
- Integration test with mocked LLM + Playwright drives a full Phase-1 run producing a `GherkinDoc` and ordered progress events.
- Failure path transitions to `failed` and emits an error event.
- Global gates (PLAN.md §A7).

## Out of scope
Phase 2 (S4); reconciliation (S5).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
