# DEV_TASK_41 — S9-02: E2E against `MyCMS` fixture

**Section:** S9 — End-to-End Integration & Demo
**Model tier:** O → Opus 4.8, high effort
**Size:** L
**Depends on:** DEV_TASK_40
**PRD ref:** §2 (both phases), §4.3 (export) — the full BAIA loop

## Goal
One green end-to-end test exercising the full pipeline against the `MyCMS` sample app: Input → Progress → Review → Export.

## Files to create / edit
- `e2e/` Playwright test: start `MyCMS` (live URL) + `baia-server` + `baia-ui`; submit the Input form with the MyCMS URL + repo path + sample instructions; observe Progress via SSE; reach Review; export to a **mock/test Confluence Space**; assert returned page URL.
- Use the deterministic `MockLlmService` (DEV_TASK_11) for reproducibility.
- Document run steps in `e2e/README.md`.

## Acceptance criteria
- E2E passes deterministically in CI (headless), covering all four stages.
- Documented local run steps.
- Global gates (PLAN.md §A7).

## Out of scope
Production deploy.

## Deliverable
Code + tests + docs + completion report (PLAN.md §A4).
