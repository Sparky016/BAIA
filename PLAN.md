# BAIA Development Plan — Orchestrated Multi-Agent Build

## Context

`PRD.md` defines **BAIA (Business Analyst AI)**: an autonomous agent that (Phase 1) drives Playwright over a live URL from natural-language instructions to capture UI behaviour, (Phase 2) ingests the corresponding source repo to extract business rules, reconciles both into Gherkin (Given-When-Then), and exports to Confluence. An Angular review dashboard lets users edit/approve before export.

Repo state at planning time:
- `baia-ui/` — fresh **Angular 19** standalone scaffold (Karma/Jasmine, CSS, empty routes). The frontend home.
- `MyCMS/` — sample **ASP.NET MVC** CMS (Home/Admin controllers, `ContentPage`, `PageRepository`). The **end-to-end demo/test fixture**: its live URL feeds Phase 1, its repo feeds Phase 2.
- No backend, no git repo yet.

**Confirmed decisions:** Full-stack scope · Backend = **Node.js/TypeScript (NestJS)** · Frontend tests stay **Karma/Jasmine** · LLM layer = **GitHub Copilot SDK** · Sub-agent model/effort **tiered by complexity**.

This plan has two interlocking parts:
1. **Part A — Orchestration Method:** agent roles, per-unit effort/model map, and the completion → acceptance-eval → section-eval → rescue feedback loop.
2. **Part B — Work Breakdown:** small, dependency-ordered work units grouped into testable sections. **Each work unit has its own brief in `tasks/DEV_TASK_{N}.md`** — see the [Task → Brief Map](#task--brief-map) at the end. All 42 briefs exist in `tasks/`.

---

## Target Architecture

Monorepo (npm workspaces), TypeScript end-to-end:

```
/baia-ui        Angular 19 frontend (exists)        — Karma/Jasmine
/baia-server    NestJS backend orchestrator (new)   — Jest
/baia-shared    Shared TS types/DTOs (new)          — single source of truth for FE+BE
/MyCMS          Sample target app — E2E fixture (exists, untouched)
```

**Backend = NestJS** (module-per-domain; each module is an independently testable unit an agent can own):
- **runs** — session lifecycle + state machine (`queued→exploring→analyzing→reconciling→review→exporting→done/failed`), REST + **SSE** progress stream.
- **llm** — **GitHub Copilot SDK** behind an `LlmService` interface (`CopilotLlmAdapter`); prompt templates; token/chunk utilities. All LLM-consuming code depends on the interface (mockable in tests).
- **explore** (Phase 1) — Playwright runner, NL→action planner, crawl/capture (DOM, network, page states).
- **gherkin** — observation → Gherkin translator/validator.
- **code-analyst** (Phase 2) — GitHub/Azure repo connectors, clone, chunk, rule extraction.
- **reconcile** — merge UI behaviour with code rules into enriched Gherkin.
- **export** — Confluence REST adapter; credential/secret handling.

**Frontend** (Angular 19, standalone, signals): routes **Input → Progress → Review**; **NgRx SignalStore** for run state; typed API client services; SSE client for live progress.

---

# PART A — ORCHESTRATION METHOD

## A1. Agent roles

| Role | Model | Effort | Responsibility |
|------|-------|--------|----------------|
| **Orchestrator** | Opus 4.8 | high | Owns this plan + task graph. Selects ready tasks (deps met), spawns impl agents with the brief from the `DEV_TASK` file, ingests reports, spawns eval agents, drives rescue loop, advances sections. |
| **Implementation agent** | per-task tier (A2) | per-task | Builds one `DEV_TASK`. MUST deliver code **+ tests** and return the completion report (A4). |
| **Acceptance-Eval agent** | Sonnet 4.6 | high | Per-task. Verifies the work against *that task's* acceptance criteria + that tests exist and are meaningful (not stubs). Read-only. Returns PASS/FAIL + findings (A5). |
| **Section-Eval agent** ("Greater Eval") | Sonnet 4.6 | high | Per-section. Runs **build + lint + full test suite + coverage gate** for the affected workspace(s). Returns structured report (A5). |
| **Rescue/Fix agent** | escalated tier (A2) | high | Spawned on any eval FAIL with the findings. Fixes, returns report; re-enters acceptance eval. |

Independent tasks are spawned **in parallel**; dependent tasks wait. Eval agents never write code; only impl/rescue agents do.

## A2. Effort & model map

Every `DEV_TASK` carries a tier tag the orchestrator uses when spawning:

| Tier | Model | Reasoning effort | Use for |
|------|-------|------------------|---------|
| **H** | Haiku 4.5 | low | Boilerplate, config, scaffolding, type/DTO files, trivial wiring. |
| **S** | Sonnet 4.6 | medium | Standard feature: a component, a service, a controller + its tests. |
| **S+** | Sonnet 4.6 | high | Non-trivial logic spanning several files; integration glue. |
| **O** | Opus 4.8 | high | Architecture, contracts, and hard algorithms: NL→action planner, code chunking, reconciliation, state machine. |

Rescue agents run **one tier above** the original task (cap at Opus/high).

## A3. Implementation-agent brief

Each `tasks/DEV_TASK_{N}.md` IS the brief: goal + why, exact files, types to consume from `baia-shared`, patterns to reuse, explicit acceptance criteria (incl. coverage gate), out-of-scope, and required deliverable (code + tests + completion report).

## A4. Completion report (impl/rescue agent → orchestrator)

```yaml
task: DEV_TASK_17        # S3-03
status: complete | blocked
files_changed: [path, ...]
criteria_addressed:                 # one line per acceptance criterion → how met
  - "<criterion>": "<evidence / file:line>"
tests_added: [path, ...]
self_check: { build: pass|fail, lint: pass|fail, tests: "12 passed", coverage: "88% lines" }
open_questions: [ ... ]             # empty if none
deviations: [ ... ]                 # any departure from the brief + reason
```

## A5. Eval report (acceptance / section eval → orchestrator)

```yaml
scope: task:DEV_TASK_17 | section:S3
verdict: PASS | FAIL
checks:                             # acceptance: per-criterion; section: build/lint/test/coverage
  - name: "<criterion or gate>"
    result: pass | fail
    detail: "<evidence or failure output>"
coverage: { lines: 88, branches: 81 }   # section eval only
required_fixes: [ ... ]             # actionable; empty on PASS
recommended_rescue_tier: S+ | O     # on FAIL only
```

## A6. The development loop (orchestrator algorithm)

1. **Select** all tasks whose dependencies have PASSED; spawn impl agents in parallel (tier per A2).
2. On each **completion report**, spawn an **Acceptance-Eval** agent for that task.
   - **FAIL** → spawn **Rescue agent** (escalated tier) with `required_fixes`; repeat from step 2. After **2 failed rescues**, escalate to the user with the eval report.
   - **PASS** → mark task done.
3. When **every task in a section** has PASSED acceptance → spawn the **Section-Eval** agent: runs the section's `build`, `lint`, `test` + **coverage gate**.
   - **FAIL** → triage `required_fixes`, spawn targeted fix agents, re-run Section-Eval.
   - **PASS** → section **Done**; advance to next section(s) whose deps are satisfied.
4. Repeat until all sections Done, then run **S9 (E2E)** as the final gate.

## A7. Global quality gates (apply to EVERY task)

- **Comprehensive test coverage is mandatory.** Section gate: **≥85% lines / ≥80% branches**; core-logic modules (`llm` chunker, `explore` planner, `reconcile`, state machine) **≥90% lines**. Tests must assert behaviour, not just execute lines.
- Backend: Jest unit tests per service/controller; LLM/Playwright/network mocked. Frontend: Karma/Jasmine specs per component/service/store.
- `lint` (ESLint + Prettier) and `build` clean — zero errors, zero new warnings.
- Public functions typed; DTOs sourced from `baia-shared`; no `any` in new code.

---

# PART B — WORK BREAKDOWN

Sections are dependency-ordered. Each work unit links to its `DEV_TASK` brief.

| Section | Work units (DEV_TASK #) | Section-Eval command |
|---------|-------------------------|----------------------|
| **S0** Foundations & Tooling | S0-01…05 → DEV_TASK 1–5 | root `lint`+`build`+`test` resolve across workspaces |
| **S1** Backend Core & API Contract | S1-01…05 → 6–10 | `baia-server` lint/build/test+cov |
| **S2** LLM Integration Layer | S2-01…04 → 11–14 | `baia-server` lint/build/test+cov |
| **S3** Phase 1: Exploratory Analyst | S3-01…06 → 15–20 | `baia-server` lint/build/test+cov |
| **S4** Phase 2: Code Analyst | S4-01…05 → 21–25 | `baia-server` lint/build/test+cov |
| **S5** Reconciliation & Merge | S5-01…03 → 26–28 | `baia-server` lint/build/test+cov |
| **S6** Integrations & Export | S6-01…03 → 29–31 | `baia-server` lint/build/test+cov |
| **S7** Frontend: Shell/Input/Progress | S7-01…05 → 32–36 | `baia-ui` lint/build/test+cov |
| **S8** Frontend: Review & Export UI | S8-01…03 → 37–39 | `baia-ui` lint/build/test+cov |
| **S9** End-to-End Integration & Demo | S9-01…03 → 40–42 | root full lint/build/test+cov + E2E |

**Sequencing:** S0 → (S1, S2 parallel) → (S3, S4 parallel) → S5 → S6; frontend (S7 → S8) runs in parallel against the S1 contract → **S9 last**.

---

## Critical Files / Modules

- New backend: `baia-server/src/{runs,llm,explore,gherkin,code-analyst,reconcile,export}/`.
- New shared: `baia-shared/src/` (DTOs/enums — single source of truth).
- Frontend additions: `baia-ui/src/app/` — `app.routes.ts` (currently empty), feature folders `input/`, `progress/`, `review/`, `core/` (store, api, sse).
- Reuse: Angular standalone + signals pattern in `baia-ui/src/app/app.config.ts`, `app.component.ts`. `MyCMS/` untouched — fixture only.
- **LLM isolation:** all model calls go through `LlmService` (`baia-server/src/llm`); `CopilotLlmAdapter` is the **only** place the GitHub Copilot SDK is imported, keeping every LLM-consuming unit testable via mocks.

## Verification (end-to-end)

1. `npm install` at root; `npm run build` builds `baia-shared` → `baia-server` → `baia-ui`.
2. `npm test` runs Jest (backend) + Karma/Jasmine (frontend) with coverage gates (A7).
3. `npm run lint` clean across workspaces.
4. **E2E demo (DEV_TASK_41):** start `MyCMS` locally; start `baia-server` + `baia-ui`; in the Input form enter the `MyCMS` URL + repo path + sample instructions; watch Progress (SSE); edit/approve in Review; export to a test/mock Confluence Space and confirm the returned page URL.
5. CI (DEV_TASK_5) reproduces 1–3 on every push; E2E runs as the final gate.

---
## Task → Brief Map

Every work unit below has a self-contained brief in the `tasks/` folder. The orchestrator opens the linked file when spawning the implementation agent (tier drives model/effort per §A2).

| # | Brief | Unit | Section | Tier | Depends on |
|---|-------|------|---------|------|------------|
| 1 | [DEV_TASK_1.md](tasks/DEV_TASK_1.md) | S0-01 Monorepo + git init | S0 | H | — |
| 2 | [DEV_TASK_2.md](tasks/DEV_TASK_2.md) | S0-02 `baia-shared` package | S0 | H | 1 |
| 3 | [DEV_TASK_3.md](tasks/DEV_TASK_3.md) | S0-03 Lint/format baseline | S0 | H | 1 |
| 4 | [DEV_TASK_4.md](tasks/DEV_TASK_4.md) | S0-04 Coverage configuration | S0 | S | 1 |
| 5 | [DEV_TASK_5.md](tasks/DEV_TASK_5.md) | S0-05 CI workflow | S0 | S | 3, 4 |
| 6 | [DEV_TASK_6.md](tasks/DEV_TASK_6.md) | S1-01 NestJS scaffold | S1 | H | 1 |
| 7 | [DEV_TASK_7.md](tasks/DEV_TASK_7.md) | S1-02 Run state machine | S1 | O | 2, 6 |
| 8 | [DEV_TASK_8.md](tasks/DEV_TASK_8.md) | S1-03 Runs module (REST) | S1 | S+ | 7 |
| 9 | [DEV_TASK_9.md](tasks/DEV_TASK_9.md) | S1-04 SSE progress stream | S1 | S+ | 7 |
| 10 | [DEV_TASK_10.md](tasks/DEV_TASK_10.md) | S1-05 OpenAPI contract | S1 | S | 8, 9 |
| 11 | [DEV_TASK_11.md](tasks/DEV_TASK_11.md) | S2-01 `LlmService` interface + DI | S2 | O | 6 |
| 12 | [DEV_TASK_12.md](tasks/DEV_TASK_12.md) | S2-02 `CopilotLlmAdapter` | S2 | S+ | 11 |
| 13 | [DEV_TASK_13.md](tasks/DEV_TASK_13.md) | S2-03 Prompt template registry | S2 | S | 11 |
| 14 | [DEV_TASK_14.md](tasks/DEV_TASK_14.md) | S2-04 Token/chunk utilities | S2 | O | 11 |
| 15 | [DEV_TASK_15.md](tasks/DEV_TASK_15.md) | S3-01 Playwright runner service | S3 | S+ | 6 |
| 16 | [DEV_TASK_16.md](tasks/DEV_TASK_16.md) | S3-02 Action vocabulary + executor | S3 | S+ | 15, 2 |
| 17 | [DEV_TASK_17.md](tasks/DEV_TASK_17.md) | S3-03 NL→action planner | S3 | O | 13, 16 |
| 18 | [DEV_TASK_18.md](tasks/DEV_TASK_18.md) | S3-04 Crawl & capture | S3 | S+ | 16 |
| 19 | [DEV_TASK_19.md](tasks/DEV_TASK_19.md) | S3-05 Gherkin generator | S3 | O | 13, 18 |
| 20 | [DEV_TASK_20.md](tasks/DEV_TASK_20.md) | S3-06 Wire Phase 1 into runs | S3 | S | 7, 17, 19 |
| 21 | [DEV_TASK_21.md](tasks/DEV_TASK_21.md) | S4-01 Repo connector interface + GitHub | S4 | S+ | 6 |
| 22 | [DEV_TASK_22.md](tasks/DEV_TASK_22.md) | S4-02 Azure Repos connector | S4 | S | 21 |
| 23 | [DEV_TASK_23.md](tasks/DEV_TASK_23.md) | S4-03 Ingestion & chunking | S4 | S+ | 21, 14 |
| 24 | [DEV_TASK_24.md](tasks/DEV_TASK_24.md) | S4-04 Rule extraction | S4 | O | 13, 23 |
| 25 | [DEV_TASK_25.md](tasks/DEV_TASK_25.md) | S4-05 Wire Phase 2 into runs | S4 | S | 7, 24 |
| 26 | [DEV_TASK_26.md](tasks/DEV_TASK_26.md) | S5-01 Reconciliation engine | S5 | O | 19, 24 |
| 27 | [DEV_TASK_27.md](tasks/DEV_TASK_27.md) | S5-02 Unified document model | S5 | S | 26, 2 |
| 28 | [DEV_TASK_28.md](tasks/DEV_TASK_28.md) | S5-03 Wire reconcile into runs | S5 | S | 7, 26 |
| 29 | [DEV_TASK_29.md](tasks/DEV_TASK_29.md) | S6-01 Credential/secret handling | S6 | O | 6 |
| 30 | [DEV_TASK_30.md](tasks/DEV_TASK_30.md) | S6-02 Confluence REST adapter | S6 | S+ | 29 |
| 31 | [DEV_TASK_31.md](tasks/DEV_TASK_31.md) | S6-03 Export endpoint + wiring | S6 | S | 8, 30, 27 |
| 32 | [DEV_TASK_32.md](tasks/DEV_TASK_32.md) | S7-01 Routing + shell | S7 | H | 1 |
| 33 | [DEV_TASK_33.md](tasks/DEV_TASK_33.md) | S7-02 NgRx SignalStore (run state) | S7 | S+ | 2 |
| 34 | [DEV_TASK_34.md](tasks/DEV_TASK_34.md) | S7-03 API client services | S7 | S | 2 |
| 35 | [DEV_TASK_35.md](tasks/DEV_TASK_35.md) | S7-04 Input form | S7 | S+ | 33, 34 |
| 36 | [DEV_TASK_36.md](tasks/DEV_TASK_36.md) | S7-05 Progress view | S7 | S+ | 33, 34 |
| 37 | [DEV_TASK_37.md](tasks/DEV_TASK_37.md) | S8-01 Gherkin viewer/editor | S8 | S+ | 33, 34 |
| 38 | [DEV_TASK_38.md](tasks/DEV_TASK_38.md) | S8-02 Approve workflow | S8 | S | 37 |
| 39 | [DEV_TASK_39.md](tasks/DEV_TASK_39.md) | S8-03 Confluence export UI | S8 | S | 38, 34 |
| 40 | [DEV_TASK_40.md](tasks/DEV_TASK_40.md) | S9-01 FE↔BE wiring & contract test | S9 | S+ | all S1–S8 |
| 41 | [DEV_TASK_41.md](tasks/DEV_TASK_41.md) | S9-02 E2E against `MyCMS` fixture | S9 | O | 40 |
| 42 | [DEV_TASK_42.md](tasks/DEV_TASK_42.md) | S9-03 Full-system Section-Eval | S9 | S | 41 |

### Dependency waves (orchestrator spawn order)

The orchestrator spawns each wave in parallel once all deps from prior waves have PASSED acceptance:

- **Wave 1:** 1
- **Wave 2:** 2, 3, 4, 6, 32 *(deps = 1)*
- **Wave 3:** 5, 7, 11, 15, 21, 29, 33, 34 *(S0 close-out + backend/FE roots)*
- **Wave 4:** 8, 9, 12, 13, 14, 16, 35, 36, 37
- **Wave 5:** 10, 17, 18, 22, 23, 38
- **Wave 6:** 19, 24, 39
- **Wave 7:** 20, 25, 26, 30
- **Wave 8:** 27, 28, 31
- **Wave 9 (final gate):** 40 → 41 → 42

---
*Individual task briefs live in `tasks/DEV_TASK_1.md` … `tasks/DEV_TASK_42.md`.*
