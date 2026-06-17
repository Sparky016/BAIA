# BAIA — Business Analyst AI

BAIA is an autonomous agent that drives Playwright over a live URL from natural-language instructions to capture UI behaviour (Phase 1), ingests the corresponding source repository to extract business rules (Phase 2), reconciles both into Gherkin specifications (Given-When-Then), and exports to Confluence. An Angular review dashboard lets users edit and approve before export.

## Workspace Map

```
/baia-ui        Angular 19 frontend (Karma/Jasmine tests)
/baia-server    NestJS backend orchestrator with LLM/Playwright/code-analysis modules (Jest tests)
/baia-shared    Shared TypeScript types and DTOs (single source of truth for FE+BE)
/MyCMS          Sample ASP.NET MVC target application — used as E2E test fixture
```

## Quick Start

```bash
npm install        # Install dependencies across all workspaces
npm run build      # Build all workspaces
npm run lint       # Lint all workspaces
npm run test       # Run all tests (Jest + Karma/Jasmine)
```
