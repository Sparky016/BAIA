# DEV_TASK_23 — S4-03: Ingestion & chunking

**Section:** S4 — Phase 2: Code Analyst
**Model tier:** S+ → Sonnet 4.6, high effort
**Size:** M
**Depends on:** DEV_TASK_21, DEV_TASK_14
**PRD ref:** §4.2 + §6.3 (clone/analyze, chunk for context window)

## Goal
Walk a connected repo, filter to relevant code (domain logic, controllers, validation), and chunk it via the token utilities for the model window.

## Files to create / edit
- `baia-server/src/code-analyst/ingestion.service.ts` — walk tree via connector; include/exclude rules (controllers, models, validators; skip vendored/binary/`bin`/`obj`); chunk each file with DEV_TASK_14.

## Acceptance criteria
- Tests against the **`MyCMS` fixture** (use repo paths): deterministic chunk output; ignore rules drop `bin/`, `obj/`, binaries; relevant files (`Controllers/`, `Models/`) included.
- Global gates (PLAN.md §A7).

## Out of scope
LLM rule extraction (DEV_TASK_24).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
