# DEV_TASK_21 — S4-01: Repo connector interface + GitHub

**Section:** S4 — Phase 2: Code Analyst
**Model tier:** S+ → Sonnet 4.6, high effort
**Size:** M
**Depends on:** DEV_TASK_6
**PRD ref:** §4.2 Repository Connection, §5 Code Analysis story

## Goal
A provider-agnostic repo connector plus a GitHub implementation, with secure token handling.

## Files to create / edit
- `baia-server/src/code-analyst/repo-connector.ts` — interface: `auth(creds)`, `listTree()`, `readFile(path)`, `clone()` (or shallow fetch).
- `baia-server/src/code-analyst/github-connector.ts` — GitHub API/clone implementation; token never logged.

## Acceptance criteria
- GitHub API mocked; tests cover auth success/failure, tree listing, file read, not-found.
- Tokens are not logged (assert via spy).
- Global gates (PLAN.md §A7).

## Out of scope
Azure (DEV_TASK_22); chunking (DEV_TASK_23).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
