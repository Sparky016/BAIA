# DEV_TASK_16 — S3-02: Action vocabulary + executor
**Status:** ✅ Complete

**Section:** S3 — Phase 1: Exploratory Analyst
**Model tier:** S+ → Sonnet 4.6, high effort
**Size:** M
**Depends on:** DEV_TASK_15, DEV_TASK_2
**PRD ref:** §4.1, §5 (handles clicks/inputs; reports errors)

## Goal
A typed, constrained action set the planner emits, plus an executor that maps each action to Playwright and captures errors instead of throwing.

## Files to create / edit
- `baia-shared/src/models/action.ts` — `Action` union: `navigate|click|fill|select|assert|waitFor` (typed params + selector).
- `baia-server/src/explore/action-executor.service.ts` — execute one action against the page; return `{ ok, error?, observation }`.

## Acceptance criteria
- Each action type unit-tested against a fixture page (mock or static HTML).
- Failures (missing selector, timeout) are **reported, not thrown**.
- Global gates (PLAN.md §A7).

## Out of scope
Deciding which action to run (DEV_TASK_17).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
