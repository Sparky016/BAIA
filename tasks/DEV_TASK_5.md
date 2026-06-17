# DEV_TASK_5 — S0-05: CI workflow

**Section:** S0 — Foundations & Tooling
**Model tier:** S → Sonnet 4.6, medium effort
**Size:** S
**Depends on:** DEV_TASK_3, DEV_TASK_4
**PRD ref:** §3

## Goal
GitHub Actions pipeline that reproduces the Section-Eval gates on every push/PR: install → lint → build → test+coverage across all workspaces.

## Files to create / edit
- `.github/workflows/ci.yml` — Node LTS; `npm ci`; `npm run lint`; `npm run build`; `npm test` (with coverage); cache npm + Playwright browsers; headless Chrome for Karma.
- Upload coverage artifacts.

## Acceptance criteria
- Workflow is valid and green against the current scaffolds.
- Fails the job when lint, build, test, or coverage gate fails.
- Global gates (PLAN.md §A7).

## Out of scope
Deployment; E2E job (added with DEV_TASK_41).

## Deliverable
Workflow + completion report (PLAN.md §A4).
