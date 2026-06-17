# DEV_TASK_39 — S8-03: Confluence export UI

**Section:** S8 — Frontend: Review Dashboard & Export UI
**Model tier:** S → Sonnet 4.6, medium effort
**Size:** S
**Depends on:** DEV_TASK_38, DEV_TASK_34
**PRD ref:** §4.3 one-click export, §5 Documentation story

## Goal
Capture the target Confluence Space/title, trigger export, and show success (link) or failure.

## Files to create / edit
- `baia-ui/src/app/review/export-panel.component.ts/.html` — Space + title inputs; "Export to Confluence" → `runsApi.export`; render returned page link on success, error message on failure; disabled until approved.

## Acceptance criteria
- Specs: success path shows link; API-failure path shows error; disabled pre-approval.
- Global gates (PLAN.md §A7).

## Out of scope
Backend export (DEV_TASK_31).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
