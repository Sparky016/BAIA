# DEV_TASK_15 — S3-01: Playwright runner service

**Section:** S3 — Phase 1: Exploratory Analyst
**Model tier:** S+ → Sonnet 4.6, high effort
**Size:** M
**Depends on:** DEV_TASK_6
**PRD ref:** §4.1 Playwright Orchestration

## Goal
Managed Playwright browser lifecycle the planner/executor build on.

## Files to create / edit
- `baia-server/src/explore/playwright-runner.service.ts` — launch/headless config, context + page creation, navigation, screenshot, timeouts, teardown; safe disposal on error.

## Acceptance criteria
- Tests with Playwright mocked (or a local static HTML fixture): launch → navigate → screenshot → teardown verified; teardown runs even on failure.
- Configurable headless + timeout.
- Global gates (PLAN.md §A7).

## Out of scope
Action vocabulary (DEV_TASK_16); planning (DEV_TASK_17).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
