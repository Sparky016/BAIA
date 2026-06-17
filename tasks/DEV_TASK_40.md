# DEV_TASK_40 — S9-01: FE↔BE wiring & contract test

**Section:** S9 — End-to-End Integration & Demo
**Model tier:** S+ → Sonnet 4.6, high effort
**Size:** M
**Depends on:** all of S1–S8 PASS
**PRD ref:** §3

## Goal
Run the Angular app against the real backend and guarantee the FE client matches the backend OpenAPI contract (no DTO drift).

## Files to create / edit
- Frontend environment/proxy config pointing to `baia-server`.
- `contract` test: validate `runs-api.service` request/response shapes against the generated OpenAPI spec (DEV_TASK_10) and `baia-shared`.

## Acceptance criteria
- Contract test passes; any DTO mismatch fails it.
- App boots end to end against the backend (smoke).
- Global gates (PLAN.md §A7).

## Out of scope
Full pipeline E2E (DEV_TASK_41).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
