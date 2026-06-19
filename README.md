# BAIA — Business Analyst AI

BAIA is an autonomous agent that drives Playwright over a live URL from natural-language instructions to capture UI behaviour (Phase 1), ingests the corresponding source repository to extract business rules (Phase 2), reconciles both into Gherkin specifications (Given-When-Then), and exports to Confluence. An Angular review dashboard lets users edit and approve before export.

## Workspace Map

```
/baia-ui        Angular 19 frontend (Karma/Jasmine tests)
/baia-server    NestJS backend orchestrator with LLM/Playwright/code-analysis modules (Jest tests)
/baia-shared    Shared TypeScript types and DTOs (single source of truth for FE+BE)
/e2e            Playwright end-to-end test suite (targets baia-server + baia-ui together)
/MyCMS          Sample ASP.NET MVC target application — used as E2E test fixture
```

## Quick Start

```bash
npm install        # Install dependencies across all workspaces
npm run build      # Build all workspaces (baia-shared → baia-server → baia-ui)
npm run lint       # Lint all workspaces (ESLint + Prettier)
npm run test       # Run all unit tests (Jest for backend, Karma/Jasmine for frontend)
npm run verify     # Full gate: lint + build + test + coverage aggregate + E2E
```

## Coverage Gates

The project enforces minimum coverage thresholds on every CI run:

| Workspace | Lines | Branches |
|-----------|-------|----------|
| `baia-server` | ≥ 85% | ≥ 80% |
| `baia-ui` | ≥ 85% | ≥ 80% |
| Core logic modules (`llm` chunker, `explore` planner, `reconcile`, state machine) | ≥ 90% | — |

## Current Status

> As of 2026-06-19. See `tasks/DEV_TASK_LIST.md` for the full task breakdown and section-eval results.

| Gate | Status | Notes |
|------|--------|-------|
| Build | ✅ Pass | All workspaces compile cleanly |
| Backend tests (802) | ✅ Pass | 91.9% lines / 89.5% branches |
| Frontend tests (53) | ✅ Pass | All green |
| Frontend branch coverage | ❌ Fail | 76% — below 80% gate; `app/review` needs more tests |
| Lint | ❌ Fail | CRLF line-ending violations in `baia-server` and `baia-shared` |
| E2E | ❌ Fail | `e2e/` workspace not yet created |

### Open items before ship

1. **CRLF line endings** — run `npx prettier --write "src/**/*.ts"` in `baia-server/` and `baia-shared/` to fix Prettier `endOfLine: lf` violations.
2. **Frontend branch coverage** — add missing branch tests to `review.component.spec.ts` and `gherkin-editor.component.spec.ts` to reach 80%.
3. **Input & Progress components** — `input.component.ts` and `progress.component.ts` are placeholder stubs; full implementations (connected to the store/API/SSE) are needed.
4. **E2E workspace** — create `e2e/` with Playwright config and an end-to-end test covering Input → Progress → Review → Export using the `MyCMS` fixture and the existing `baia-server/src/e2e/` mock infrastructure.

## Architecture

```
[Browser] ──── Angular 19 (signals, NgRx SignalStore) ────▶ Input / Progress / Review pages
                        │  HTTP + SSE
                        ▼
[NestJS baia-server]
  ├── runs/          State machine (queued → exploring → analyzing → reconciling → review → exporting → done)
  ├── llm/           LlmService interface + CopilotLlmAdapter (GitHub Copilot SDK)
  ├── explore/       Playwright runner, NL→action planner, crawl & capture
  ├── gherkin/       Gherkin generator + validator
  ├── code-analyst/  GitHub/Azure repo connectors, ingestion, rule extraction
  ├── reconcile/     Merge UI behaviour with code rules into enriched Gherkin
  ├── export/        Confluence REST adapter + export controller
  └── security/      Encrypted credential store + redaction utilities
```

**LLM isolation:** all model calls go through the `LlmService` interface. `CopilotLlmAdapter` is the only file that imports the GitHub Copilot SDK, keeping every consuming module mockable in unit tests.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request:

1. **Lint** — `npm run lint`
2. **Build** — `npm run build`
3. **Test + coverage** — `npm test` (Jest for `baia-server`, Karma/ChromeHeadless for `baia-ui`)
4. **Aggregate coverage** — `npm run coverage:aggregate`
5. **E2E** (separate job, runs after unit tests pass) — `npm run test:e2e`
