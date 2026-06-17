# DEV_TASK_25 — S4-05: Wire Phase 2 into runs

**Section:** S4 — Phase 2: Code Analyst
**Model tier:** S → Sonnet 4.6, medium effort
**Size:** S
**Depends on:** DEV_TASK_7, DEV_TASK_24
**PRD ref:** §2 Phase 2, §3 orchestrator workflow

## Goal
Orchestrate the `analyzing` state: connect repo → ingest/chunk → extract rules, with progress events and failure handling.

## Files to create / edit
- `baia-server/src/code-analyst/analyze.orchestrator.ts` — connect via provider, ingest, extract, store `BusinessRule[]` on the run; emit progress; on error → `failed`.

## Acceptance criteria
- Integration test drives a full Phase-2 run with mocked connector + LLM, producing rules + ordered progress events.
- Failure path → `failed` + error event.
- Global gates (PLAN.md §A7).

## Out of scope
Reconciliation (S5).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
