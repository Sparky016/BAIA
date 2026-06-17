# DEV_TASK_37 — S8-01: Gherkin viewer/editor

**Section:** S8 — Frontend: Review Dashboard & Export UI
**Model tier:** S+ → Sonnet 4.6, high effort
**Size:** L
**Depends on:** DEV_TASK_33, DEV_TASK_34
**PRD ref:** §4.3 Review Dashboard, §5

## Goal
Render the unified Gherkin doc (features/scenarios/steps) with inline editing and per-step provenance (UI vs code vs merged).

## Files to create / edit
- `baia-ui/src/app/review/gherkin-editor.component.ts/.html` — render `GherkinDoc`; inline edit of feature/scenario/step text; provenance badge per step; conflict indicators; write edits back to the store.

## Acceptance criteria
- Specs: renders features/scenarios/steps; edits update the store; provenance badges + conflict markers display correctly.
- Global gates (PLAN.md §A7).

## Out of scope
Approve gating (DEV_TASK_38); export (DEV_TASK_39).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
