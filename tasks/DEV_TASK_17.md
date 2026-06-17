# DEV_TASK_17 — S3-03: NL→action planner

**Section:** S3 — Phase 1: Exploratory Analyst
**Model tier:** O → Opus 4.8, high effort
**Size:** L
**Depends on:** DEV_TASK_13, DEV_TASK_16
**PRD ref:** §4.1 (parse NL → Playwright commands), §5 (UI Exploration story)

## Goal
The core of Phase 1: turn free-form instructions + current page state into the next action(s) via the LLM, in a bounded loop with stop conditions.

## Files to create / edit
- `baia-server/src/explore/action-planner.service.ts` — uses the `action-planning` prompt (DEV_TASK_13) + `LlmService.completeJson` to produce next `Action`(s); feeds executor results back; bounded by `maxSteps`; stop when goal reached / no progress / max steps.

## Acceptance criteria
- `LlmService` mocked. Tests cover: single-step plan, multi-step plan, ambiguous instruction handling, max-steps guard, no-progress termination, invalid LLM output rejected/retried.
- Never loops unbounded. **≥90% lines** (core-logic module).
- Global gates (PLAN.md §A7).

## Out of scope
Capturing the trace (DEV_TASK_18); Gherkin (DEV_TASK_19).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
