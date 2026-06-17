# DEV_TASK_30 — S6-02: Confluence REST adapter

**Section:** S6 — Integrations & Export
**Model tier:** S+ → Sonnet 4.6, high effort
**Size:** M
**Depends on:** DEV_TASK_29
**PRD ref:** §4.3 Confluence Integration, §5 Documentation story

## Goal
Authenticate to Confluence and create/update a page in a target Space, rendering the unified Gherkin doc into Confluence storage format.

## Files to create / edit
- `baia-server/src/export/confluence.adapter.ts` — auth (creds via DEV_TASK_29), create/update page by Space + title.
- `baia-server/src/export/gherkin-to-confluence.ts` — `GherkinDoc` → Confluence storage-format markup.

## Acceptance criteria
- Confluence API mocked; tests cover auth success/failure, create vs update, and render correctness (golden markup).
- Global gates (PLAN.md §A7).

## Out of scope
Endpoint wiring (DEV_TASK_31).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
