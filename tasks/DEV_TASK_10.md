# DEV_TASK_10 — S1-05: OpenAPI contract

**Section:** S1 — Backend Core & API Contract
**Model tier:** S → Sonnet 4.6, medium effort
**Size:** S
**Depends on:** DEV_TASK_8, DEV_TASK_9
**PRD ref:** §3 (API), enables FE contract test (DEV_TASK_40)

## Goal
Publish a Swagger/OpenAPI document so the frontend client and contract tests have a single, verifiable API spec.

## Files to create / edit
- `@nestjs/swagger` setup in `main.ts`; `GET /api-docs` + JSON spec export.
- Decorate runs/SSE/export DTOs; keep shapes aligned to `baia-shared`.

## Acceptance criteria
- Generated spec validates (OpenAPI 3) and includes `/runs`, `/runs/:id`, `/runs/:id/events`.
- Tests: a spec asserts the document contains the expected paths + a sample request/response schema.
- Global gates (PLAN.md §A7).

## Out of scope
Export endpoint shape finalised later (DEV_TASK_31 re-decorates).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
