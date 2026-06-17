# DEV_TASK_1 — S0-01: Monorepo + git init
**Status:** ✅ Complete

**Section:** S0 — Foundations & Tooling
**Model tier:** H → Haiku 4.5, low effort
**Size:** S
**Depends on:** none
**PRD ref:** §3 System Architecture

## Goal
Establish the npm-workspace monorepo and git repository so all later workspaces share one install/build/lint/test surface.

## Files to create / edit
- `.git/` via `git init`
- root `package.json` — npm workspaces: `baia-ui`, `baia-server`, `baia-shared`; root scripts `build`, `lint`, `test` that fan out to each workspace (`npm run <x> --workspaces --if-present`).
- root `.gitignore` — node_modules, dist, coverage, `.env`, Playwright artifacts. (Keep `MyCMS/` build output ignored too.)
- `README.md` (root) — one paragraph + workspace map.

## Reuse / consume
- Existing `baia-ui/package.json` scripts (`build`, `test`) — root scripts delegate to them.

## Acceptance criteria
- `npm install` at root succeeds and links all three workspaces.
- `npm run build` builds all workspaces (baia-server/baia-shared may be empty stubs at this point — must still resolve).
- `MyCMS/` is untouched.
- Global gates (PLAN.md §A7): lint/build clean.

## Out of scope
Any app code; CI; lint configs (DEV_TASK_3/5).

## Deliverable
Code + minimal smoke verification + completion report (PLAN.md §A4).
