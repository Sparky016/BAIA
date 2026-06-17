# DEV_TASK_31 — S6-03: Export endpoint + wiring

**Section:** S6 — Integrations & Export
**Model tier:** S → Sonnet 4.6, medium effort
**Size:** S
**Depends on:** DEV_TASK_8, DEV_TASK_30, DEV_TASK_27
**PRD ref:** §4.3 one-click export

## Goal
Expose export over REST and drive the `exporting` state, returning the created Confluence page URL.

## Files to create / edit
- `baia-server/src/export/export.controller.ts` — `POST /runs/:id/export` (body: Space, title); transition `review→exporting→done`; return `{ url }`.
- Re-decorate for OpenAPI (DEV_TASK_10).

## Acceptance criteria
- Controller spec + integration test: exports a fixture unified doc (Confluence mocked) and returns a URL; export blocked unless run is in `review`.
- Global gates (PLAN.md §A7).

## Out of scope
UI trigger (DEV_TASK_39).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
