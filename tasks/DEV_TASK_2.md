# DEV_TASK_2 — S0-02: `baia-shared` package
**Status:** ✅ Complete

**Section:** S0 — Foundations & Tooling
**Model tier:** H → Haiku 4.5, low effort
**Size:** S
**Depends on:** DEV_TASK_1
**PRD ref:** §3, §4 (DTOs span all features)

## Goal
Create the shared TypeScript package that is the single source of truth for DTOs/enums used by both `baia-server` and `baia-ui`.

## Files to create / edit
- `baia-shared/package.json`, `tsconfig.json` (emit declarations).
- `baia-shared/src/index.ts` — barrel export.
- `baia-shared/src/models/` — initial types:
  - `RunStatus` enum: `queued|exploring|analyzing|reconciling|review|exporting|done|failed`.
  - `RunRequest` (targetUrl, instructions, repoUrl, repoProvider, credentialsRef).
  - `RunSummary`, `ExploreEvent`, `GherkinDoc`, `GherkinFeature/Scenario/Step` (step carries `provenance: 'ui'|'code'|'merged'`).
  - `BusinessRule` (id, description, category, sourceRef).
- `baia-shared/src/guards.ts` — at least one runtime type guard (e.g. `isRunRequest`).

## Acceptance criteria
- Importable from both apps via the workspace name.
- Builds and emits `.d.ts`.
- Tests: ≥1 spec for the type guard(s) covering valid + invalid input.
- Global gates (PLAN.md §A7).

## Out of scope
Business logic; HTTP; persistence.

## Deliverable
Code + tests + completion report (PLAN.md §A4).
