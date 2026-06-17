# DEV_TASK_35 — S7-04: Input form
**Status:** ✅ Complete

**Section:** S7 — Frontend: Shell, Input, Progress
**Model tier:** S+ → Sonnet 4.6, high effort
**Size:** M
**Depends on:** DEV_TASK_33, DEV_TASK_34
**PRD ref:** §4.1 Input Mechanisms, §5 Frontend story

## Goal
The "Start BAIA" reactive form: target URL, behaviour instructions, repo URL + provider + credentials.

## Files to create / edit
- `baia-ui/src/app/input/input.component.ts/.html` — reactive form: target URL (validated), instructions textarea, repo URL + provider select + credentials; submit → `createRun` → navigate to `progress/:id`.

## Acceptance criteria
- **URL validation blocks submit** when invalid (PRD AC); textarea handles long detailed input; submit dispatches and navigates.
- Specs: validation states, submit success/error.
- Global gates (PLAN.md §A7).

## Out of scope
Progress rendering (DEV_TASK_36).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
