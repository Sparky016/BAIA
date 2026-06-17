# DEV_TASK_8 — S1-03: Runs module (REST)
**Status:** ✅ Complete

**Section:** S1 — Backend Core & API Contract
**Model tier:** S+ → Sonnet 4.6, high effort
**Size:** M
**Depends on:** DEV_TASK_7
**PRD ref:** §4.1 inputs, §5 Frontend story

## Goal
REST surface to create and read runs, backed by an in-memory store and the state machine.

## Files to create / edit
- `baia-server/src/runs/runs.controller.ts` — `POST /runs` (body `RunRequest`), `GET /runs/:id` (`RunSummary`), `GET /runs`.
- `baia-server/src/runs/runs.service.ts` — in-memory store; creates runs in `queued`; uses the state machine (DEV_TASK_7).
- DTO validation via `class-validator` aligned to `baia-shared` types.

## Acceptance criteria
- Invalid `RunRequest` (bad URL, missing fields) → 400 with field errors.
- `GET /runs/:id` for unknown id → 404.
- Tests: controller + service specs incl. validation failures and not-found.
- Global gates (PLAN.md §A7).

## Out of scope
Actually running phases (wired in DEV_TASK_20/25/28/31); persistence beyond memory.

## Deliverable
Code + tests + completion report (PLAN.md §A4).
