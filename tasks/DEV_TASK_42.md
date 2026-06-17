# DEV_TASK_42 — S9-03: Full-system Section-Eval

**Section:** S9 — End-to-End Integration & Demo
**Model tier:** S → Sonnet 4.6, medium effort
**Size:** M
**Depends on:** DEV_TASK_41
**PRD ref:** PLAN.md §A6–A7 (final gate)

## Goal
The final greater-eval gate: lint + build + test + coverage across all workspaces, plus aggregate coverage, plus the E2E job — green before "done".

## Files to create / edit
- Root `verify` script chaining `lint`, `build`, `test` (all workspaces) + the E2E job.
- Aggregate coverage report across workspaces.
- Add the E2E job to CI (DEV_TASK_5).

## Acceptance criteria
- All gates green at §A7 thresholds (≥85% lines / ≥80% branches; core modules ≥90%).
- CI runs unit + E2E as the final gate.
- Global gates (PLAN.md §A7).

## Out of scope
New features.

## Deliverable
Scripts/CI + aggregate coverage proof + completion report (PLAN.md §A4).
