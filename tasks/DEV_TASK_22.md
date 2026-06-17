# DEV_TASK_22 — S4-02: Azure Repos connector

**Section:** S4 — Phase 2: Code Analyst
**Model tier:** S → Sonnet 4.6, medium effort
**Size:** S
**Depends on:** DEV_TASK_21
**PRD ref:** §4.2 (GitHub or Azure Repos)

## Goal
Azure Repos implementation of `RepoConnector` with behaviour parity to the GitHub connector.

## Files to create / edit
- `baia-server/src/code-analyst/azure-connector.ts` — implements `RepoConnector` against Azure DevOps APIs.
- Provider selection by `RunRequest.repoProvider`.

## Acceptance criteria
- Azure API mocked; **parity tests** mirroring the GitHub connector suite (auth, tree, read, not-found).
- Global gates (PLAN.md §A7).

## Out of scope
Chunking/extraction.

## Deliverable
Code + tests + completion report (PLAN.md §A4).
