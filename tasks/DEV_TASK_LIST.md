# BAIA Task List

> Auto-generated task overview. Source files: `tasks/DEV_TASK_{N}.md` (42 total).

---

## Summary

| Status | Count |
|--------|-------|
| ✅ Complete | 39 |
| ❌ Blocked / needs fix | 3 |
| ⏳ Not started | 0 |

---

## By Section

### S0 — Foundations & Tooling (5/5 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 1 | S0-01 Monorepo + git init | H | ✅ Complete |
| 2 | S0-02 `baia-shared` package | H | ✅ Complete |
| 3 | S0-03 Lint/format baseline | H | ✅ Complete |
| 4 | S0-04 Coverage configuration | S | ✅ Complete |
| 5 | S0-05 CI workflow | S | ✅ Complete |

### S1 — Backend Core & API Contract (5/5 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 6 | S1-01 NestJS scaffold | H | ✅ Complete |
| 7 | S1-02 Run state machine | O | ✅ Complete |
| 8 | S1-03 Runs module (REST) | S+ | ✅ Complete |
| 9 | S1-04 SSE progress stream | S+ | ✅ Complete |
| 10 | S1-05 OpenAPI contract | S | ✅ Complete |

### S2 — LLM Integration Layer (4/4 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 11 | S2-01 `LlmService` interface + DI | O | ✅ Complete |
| 12 | S2-02 `CopilotLlmAdapter` | S+ | ✅ Complete |
| 13 | S2-03 Prompt template registry | S | ✅ Complete |
| 14 | S2-04 Token/chunk utilities | O | ✅ Complete |

### S3 — Phase 1: Exploratory Analyst (6/6 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 15 | S3-01 Playwright runner service | S+ | ✅ Complete |
| 16 | S3-02 Action vocabulary + executor | S+ | ✅ Complete |
| 17 | S3-03 NL→action planner | O | ✅ Complete |
| 18 | S3-04 Crawl & capture | S+ | ✅ Complete |
| 19 | S3-05 Gherkin generator | O | ✅ Complete |
| 20 | S3-06 Wire Phase 1 into runs | S | ✅ Complete |

### S4 — Phase 2: Code Analyst (5/5 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 21 | S4-01 Repo connector interface + GitHub | S+ | ✅ Complete |
| 22 | S4-02 Azure Repos connector | S | ✅ Complete |
| 23 | S4-03 Ingestion & chunking | S+ | ✅ Complete |
| 24 | S4-04 Rule extraction | O | ✅ Complete |
| 25 | S4-05 Wire Phase 2 into runs | S | ✅ Complete |

### S5 — Reconciliation & Merge (3/3 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 26 | S5-01 Reconciliation engine | O | ✅ Complete |
| 27 | S5-02 Unified document model | S | ✅ Complete |
| 28 | S5-03 Wire reconcile into runs | S | ✅ Complete |

### S6 — Integrations & Export (3/3 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 29 | S6-01 Credential/secret handling | O | ✅ Complete |
| 30 | S6-02 Confluence REST adapter | S+ | ✅ Complete |
| 31 | S6-03 Export endpoint + wiring | S | ✅ Complete |

### S7 — Frontend: Shell/Input/Progress (5/5 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 32 | S7-01 Routing + shell | H | ✅ Complete |
| 33 | S7-02 NgRx SignalStore (run state) | S+ | ✅ Complete |
| 34 | S7-03 API client services | S | ✅ Complete |
| 35 | S7-04 Input form | S+ | ✅ Complete |
| 36 | S7-05 Progress view | S+ | ✅ Complete |

### S8 — Frontend: Review Dashboard & Export UI (2/3 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 37 | S8-01 Gherkin viewer/editor | S+ | ✅ Complete |
| 38 | S8-02 Approve workflow | S | ✅ Complete |
| 39 | S8-03 Confluence export UI | S | ✅ Complete |

### S9 — End-to-End Integration & Demo (0/3)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 40 | S9-01 FE↔BE wiring & contract test | S+ | ❌ `e2e/` workspace missing |
| 41 | S9-02 E2E against `MyCMS` fixture | O | ❌ `e2e/` workspace missing |
| 42 | S9-03 Full-system Section-Eval | S | ❌ Blocked by 40, 41 |

---

## Dependency Waves

```
Wave 1:  1
Wave 2:  2, 3, 4, 6, 32
Wave 3:  5, 7, 11, 15, 21, 29, 33, 34
Wave 4:  8, 9, 12, 13, 14, 16, 35, 36, 37
Wave 5:  10, 17, 18, 22, 23, 38
Wave 6:  19, 24, 39
Wave 7:  20, 25, 26, 30
Wave 8:  27, 28, 31
Wave 9:  40 → 41 → 42
```

**Completed waves:** 1–8 (with exceptions noted below). Wave 9 is blocked.

---

*See `PLAN.md` for full orchestration method and `tasks/DEV_TASK_{N}.md` for individual briefs.*

---

## Section-Eval Results (2026-06-19, updated 2026-06-19)

### Gates checked

| Gate | Result | Detail |
|------|--------|--------|
| `npm run build` | ✅ PASS | All three workspaces build cleanly. Zero errors. |
| `baia-server` tests | ✅ PASS | 802 tests, 33 suites — all green. |
| `baia-server` coverage | ✅ PASS | 91.9% lines / 89.5% branches — exceeds ≥85%/≥80% gates. |
| `baia-ui` tests | ✅ PASS | 89 tests — all green (FIX-B + FIX-C added 36 new tests). |
| `baia-ui` branch coverage | ✅ PASS | 89.47% branches (gate ≥80%). FIX-B + FIX-C raised from 76% to 89.47%. |
| `npm run lint` | ❌ FAIL | 284+ CRLF errors across `baia-server/src/**/*.ts` and `baia-shared/src/**/*.ts`. Prettier `endOfLine: lf` violated by Windows line endings. |
| E2E (`npm run test:e2e`) | ❌ FAIL | `e2e/` workspace directory does not exist. |

---

## Remaining Tasks for Developers

The following items must be resolved before the project can be considered shippable (Wave 9 / S9).

### FIX-A — CRLF line endings (Blocker for CI lint gate)

**Priority: High. Affects: `baia-server`, `baia-shared`.**

Every `.ts` file in `baia-server/src/` and `baia-shared/src/` has Windows CRLF line endings, violating the Prettier `endOfLine: lf` rule. The CI lint step will fail on every push until this is fixed.

**Fix:** Run in the repo root:
```bash
cd baia-server && npx prettier --write "src/**/*.ts" && cd ../baia-shared && npx prettier --write "src/**/*.ts"
```
Or configure `.gitattributes` with `*.ts text eol=lf` and re-checkout files.
Verify with: `npm run lint`

---

### ~~FIX-B — Frontend branch coverage below gate~~ ✅ RESOLVED (2026-06-19)

Added missing test cases to `review.component.spec.ts` (exportTooltip branches), `gherkin-editor.component.spec.ts` (null editableDoc + out-of-bounds guards), and `export-panel.component.spec.ts` (error fallback message). Branch coverage: 76% → 89.47%.

---

### ~~FIX-C — Input form and Progress view are stub placeholders~~ ✅ RESOLVED (2026-06-19)

Implemented `input.component.ts` (reactive form with URL validation, instructions, repo + credentials fields, Start BAIA button → createRun → navigate to `/progress/:id`) and `progress.component.ts` (EventSource SSE, RunTransitionEvent/ExploreEvent handling, auto-navigate to `/review/:id` on Review status). Both have full Karma/Jasmine spec files (11 + 12 tests respectively). All 89 baia-ui tests green; branch coverage 89.47%.

---

### FIX-D — `e2e/` workspace missing (S9 entirely blocked)

**Priority: High. Affects: DEV_TASK_40, DEV_TASK_41, DEV_TASK_42.**

The `e2e/` directory is declared as a workspace in `package.json` and referenced in both the CI workflow and the root `verify` script, but the directory was never created. `npm run test:e2e` will fail with a workspace resolution error.

**Fix:** Create the `e2e/` workspace with:
- `package.json` declaring `@playwright/test` and a `test` script (`playwright test`)
- `playwright.config.ts` — base URL pointing at the local `baia-server` + `baia-ui` dev servers; uses `e2e-server.ts` for the backend fixture
- `tests/baia.spec.ts` — end-to-end scenario: Input form → Start run → Progress SSE → Review page → Approve → Export to mock Confluence
- CI will install browsers via `npm run install:browsers --workspace=e2e` before running

The backend E2E fixture (`baia-server/src/e2e/`) already exists (mock orchestrators, `e2e-server.ts`). The Playwright tests in `e2e/tests/` should target the real HTTP endpoints served by `e2e-server.ts`.

---

### Sequencing

```
FIX-A (lint)  ─── can run immediately, independent
FIX-B         ─── ✅ Done
FIX-C         ─── ✅ Done
FIX-D (e2e)   ─── start now (FIX-B/-C are green); DEV_TASK_40→41→42 in order
```

Once FIX-A and FIX-D are green, run `npm run verify` to confirm the full pipeline (lint + build + test + coverage:aggregate + test:e2e) passes end-to-end.
