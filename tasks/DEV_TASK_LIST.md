# BAIA Task List

> Auto-generated task overview. Source files: `tasks/DEV_TASK_{N}.md` (42 total).

---

## Summary

| Status | Count |
|--------|-------|
| ✅ Complete | 23 |
| ⏳ Not started | 19 |

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

### S1 — Backend Core & API Contract (4/5 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 6 | S1-01 NestJS scaffold | H | ✅ Complete |
| 7 | S1-02 Run state machine | O | ✅ Complete |
| 8 | S1-03 Runs module (REST) | S+ | ✅ Complete |
| 9 | S1-04 SSE progress stream | S+ | ✅ Complete |
| 10 | S1-05 OpenAPI contract | S | ⏳ Not started |

### S2 — LLM Integration Layer (4/4 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 11 | S2-01 `LlmService` interface + DI | O | ✅ Complete |
| 12 | S2-02 `CopilotLlmAdapter` | S+ | ✅ Complete |
| 13 | S2-03 Prompt template registry | S | ✅ Complete |
| 14 | S2-04 Token/chunk utilities | O | ✅ Complete |

### S3 — Phase 1: Exploratory Analyst (2/6 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 15 | S3-01 Playwright runner service | S+ | ✅ Complete |
| 16 | S3-02 Action vocabulary + executor | S+ | ✅ Complete |
| 17 | S3-03 NL→action planner | O | ⏳ Not started |
| 18 | S3-04 Crawl & capture | S+ | ⏳ Not started |
| 19 | S3-05 Gherkin generator | O | ⏳ Not started |
| 20 | S3-06 Wire Phase 1 into runs | S | ⏳ Not started |

### S4 — Phase 2: Code Analyst (1/5 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 21 | S4-01 Repo connector interface + GitHub | S+ | ✅ Complete |
| 22 | S4-02 Azure Repos connector | S | ⏳ Not started |
| 23 | S4-03 Ingestion & chunking | S+ | ⏳ Not started |
| 24 | S4-04 Rule extraction | O | ⏳ Not started |
| 25 | S4-05 Wire Phase 2 into runs | S | ⏳ Not started |

### S5 — Reconciliation & Merge (0/3 ⏳)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 26 | S5-01 Reconciliation engine | O | ⏳ Not started |
| 27 | S5-02 Unified document model | S | ⏳ Not started |
| 28 | S5-03 Wire reconcile into runs | S | ⏳ Not started |

### S6 — Integrations & Export (1/3 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 29 | S6-01 Credential/secret handling | O | ✅ Complete |
| 30 | S6-02 Confluence REST adapter | S+ | ⏳ Not started |
| 31 | S6-03 Export endpoint + wiring | S | ⏳ Not started |

### S7 — Frontend: Shell/Input/Progress (5/5 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 32 | S7-01 Routing + shell | H | ✅ Complete |
| 33 | S7-02 NgRx SignalStore (run state) | S+ | ✅ Complete |
| 34 | S7-03 API client services | S | ✅ Complete |
| 35 | S7-04 Input form | S+ | ✅ Complete |
| 36 | S7-05 Progress view | S+ | ✅ Complete |

### S8 — Frontend: Review Dashboard & Export UI (1/3 ✅)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 37 | S8-01 Gherkin viewer/editor | S+ | ✅ Complete |
| 38 | S8-02 Approve workflow | S | ⏳ Not started |
| 39 | S8-03 Confluence export UI | S | ⏳ Not started |

### S9 — End-to-End Integration & Demo (0/3 ⏳)

| # | Unit | Tier | Status |
|---|------|------|--------|
| 40 | S9-01 FE↔BE wiring & contract test | S+ | ⏳ Not started |
| 41 | S9-02 E2E against `MyCMS` fixture | O | ⏳ Not started |
| 42 | S9-03 Full-system Section-Eval | S | ⏳ Not started |

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

**Completed waves:** 1, 2, 3, 4 — ready for waves 5–9.

---

*See `PLAN.md` for full orchestration method and `tasks/DEV_TASK_{N}.md` for individual briefs.*
