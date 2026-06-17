# DEV_TASK_4 — S0-04: Coverage configuration

**Section:** S0 — Foundations & Tooling
**Model tier:** S → Sonnet 4.6, medium effort
**Size:** S
**Depends on:** DEV_TASK_1
**PRD ref:** §3; PLAN.md §A7

## Goal
Wire coverage thresholds so a workspace build/test **fails** when coverage drops below the §A7 gate — the enforcement mechanism for "comprehensive test coverage".

## Files to create / edit
- `baia-server` Jest config: `coverageThreshold` global ≥85% lines / ≥80% branches; allow per-path overrides ≥90% for core-logic modules (added as those modules land).
- `baia-ui` Karma config: `karma-coverage` reporter + `check` thresholds ≥85% lines / ≥80% branches; headless Chrome (`ChromeHeadless`) for CI.
- Document the per-module ≥90% override convention in a comment.

## Acceptance criteria
- A deliberately under-covered dummy spec makes the gate **fail** (prove it, then remove the dummy).
- Headless Karma run works without a visible browser.
- Coverage reports emitted to `coverage/` in each workspace.
- Global gates (PLAN.md §A7).

## Out of scope
Real feature tests; CI (DEV_TASK_5).

## Deliverable
Config + proof-of-gate notes in completion report (PLAN.md §A4).
