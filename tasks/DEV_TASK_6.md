# DEV_TASK_6 — S1-01: NestJS scaffold

**Section:** S1 — Backend Core & API Contract
**Model tier:** H → Haiku 4.5, low effort
**Size:** S
**Depends on:** DEV_TASK_1
**PRD ref:** §3 Backend Orchestrator

## Goal
Stand up the `baia-server` NestJS application with config, health check, and CORS for the Angular dev origin.

## Files to create / edit
- `baia-server/` Nest app: `main.ts`, `app.module.ts`, `package.json` (depends on `baia-shared`).
- `ConfigModule` reading `.env` (`PORT`, `COPILOT_*`, `CORS_ORIGIN`).
- `HealthController` → `GET /health` returns `{ status: 'ok' }`.
- Enable CORS for the Angular dev origin.

## Acceptance criteria
- `nest start` boots; `GET /health` returns 200.
- Tests: health controller spec.
- Global gates (PLAN.md §A7).

## Out of scope
Runs domain (DEV_TASK_7+); persistence.

## Deliverable
Code + tests + completion report (PLAN.md §A4).
