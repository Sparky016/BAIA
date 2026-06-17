# DEV_TASK_38 — S8-02: Approve workflow

**Section:** S8 — Frontend: Review Dashboard & Export UI
**Model tier:** S → Sonnet 4.6, medium effort
**Size:** S
**Depends on:** DEV_TASK_37
**PRD ref:** §4.3 (review, edit, approve)

## Goal
Gate export behind an explicit approve step after review/editing.

## Files to create / edit
- `baia-ui/src/app/review/review.component.ts/.html` — host the editor; "Approve" action sets approved state in the store; export remains disabled until approved.

## Acceptance criteria
- Specs: export disabled until approved; approving enables it; editing after approval re-gates (decide + test the rule).
- Global gates (PLAN.md §A7).

## Out of scope
Export call (DEV_TASK_39).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
