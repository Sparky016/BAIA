# BAIA — Business AI Analyst

[![Build & Test](https://github.com/Sparky016/BAIA/actions/workflows/ci.yml/badge.svg)](https://github.com/anthropics/BAIA/actions)
[![Coverage](https://img.shields.io/badge/coverage-91.9%25%20%2F%2092.3%25-brightgreen)](#coverage-gates)
[![License](https://img.shields.io/badge/license-MIT-blue)](#license)

**BAIA** is an autonomous intelligence platform that revolutionizes business requirements documentation by combining automated UI exploration with deep codebase analysis. It transforms natural-language instructions into comprehensive, BDD-formatted (Gherkin) specifications that capture both user-facing workflows and underlying programmatic business rules—all reconciled, reviewed, and exported directly to Confluence.

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Development](#development)
- [Coverage & Quality Gates](#coverage--quality-gates)
- [Contributing](#contributing)
- [License](#license)

## Overview

BAIA operates through a proven two-phase analysis pipeline:

1. **Phase 1: Exploratory Analysis** — An autonomous agent powered by Playwright and AI interprets natural-language instructions to navigate a live application URL, capturing UI interactions, page states, and user workflows.

2. **Phase 2: Code Analysis** — A static analyzer ingests the target application's source repository (GitHub or Azure Repos), extracts business logic, validation rules, and domain constraints from the codebase.

3. **Reconciliation & Review** — BAIA cross-references UI behavior against backend business rules, generating a unified, enriched Gherkin specification. Users review and edit the documentation in an Angular dashboard before one-click export to Confluence.

This dual-source approach ensures documentation accuracy: UI specifications are grounded in actual application behavior, while backend insights add precision about edge cases, constraints, and business logic that UI exploration alone cannot reveal.

## Key Features

### 🤖 Autonomous Exploration
- **Natural Language Processing**: Convert plain-English instructions into executable Playwright scripts via LLM
- **Dynamic Action Planning**: Intelligent parsing of clicks, form fills, navigation, and assertions
- **DOM Capture**: Real-time collection of UI elements, states, and interaction sequences

### 📊 Code Intelligence
- **Repository Ingestion**: Secure connectors for GitHub and Azure Repos
- **Business Rule Extraction**: Automated discovery of validation logic, constraints, and domain rules
- **Context Window Optimization**: Intelligent code chunking for large repositories

### ✍️ BDD Documentation
- **Gherkin Generation**: Automatic conversion of observed behavior to Given-When-Then specifications
- **Quality Validation**: Built-in Gherkin syntax and semantic validation
- **Unified Enrichment**: Merge UI behavior with backend rules for comprehensive specifications

### 👁️ Review & Approval
- **Interactive Dashboard**: Angular 19 frontend with real-time progress tracking
- **Collaborative Editing**: Edit and refine Gherkin before export
- **SSE Updates**: Live event streaming from backend orchestrator

### 🔄 Enterprise Export
- **Confluence Integration**: One-click REST API export to Confluence spaces
- **Batch Operations**: Export multiple scenarios simultaneously
- **Change Tracking**: Confluence integration preserves documentation lineage

### 🔐 Security & Compliance
- **Encrypted Credentials**: Secure storage of repository and Confluence tokens
- **PII Redaction**: Automatic redaction of sensitive data in exported documentation
- **Role-Based Access**: Integration-ready credential scoping

## Quick Start

### Prerequisites
- **Node.js** 18+
- **npm** 9+
- **Git**
- **Chrome** or **Chromium** (for Playwright)

### Installation

```bash
# Clone repository
git clone https://github.com/anthropics/BAIA.git
cd BAIA

# Install dependencies across all workspaces
npm install

# Build all workspaces (respects dependency order: shared → server → ui)
npm run build

# Verify lint, build, and test in one command
npm run verify
```

### Development Workflow

```bash
# Start backend in watch mode (localhost:3000)
cd baia-server && npm run start:dev

# In another terminal, start frontend dev server (localhost:4200)
cd baia-ui && npm start

# Run tests in watch mode
npm run test:watch

# Format and lint code
npm run lint
```

### Running Tests

```bash
# Run all unit tests with coverage
npm run test

# Run specific workspace tests
npm test --workspace=baia-server
npm test --workspace=baia-ui

# Watch mode (development)
npm test:watch

# End-to-end tests
npm run test:e2e

# Full quality gate (lint + build + test + coverage + E2E)
npm run verify
```

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Interface (Angular 19)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │    Input     │  │   Progress   │  │    Review    │          │
│  │   (target    │  │   (live      │  │   (edit &    │          │
│  │    URL +     │  │    events)   │  │   approve)   │          │
│  │ instructions)│  │              │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
           │                                         │
           │     HTTP + Server-Sent Events (SSE)    │
           ▼                                         │
┌─────────────────────────────────────────────────────────────────┐
│              Backend Orchestrator (NestJS)                      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Run State Machine: queued → exploring → analyzing →     │  │
│  │  reconciling → review → exporting → done                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │   Explore      │  │   Code         │  │   Reconcile    │   │
│  │   Module       │  │   Analysis     │  │   Module       │   │
│  │                │  │   Module       │  │                │   │
│  │ • Playwright   │  │ • GitHub API   │  │ • Merge rules  │   │
│  │   runner       │  │ • Azure Repos  │  │ • Enrich       │   │
│  │ • Action       │  │   API          │  │   Gherkin      │   │
│  │   planner      │  │ • Rule         │  │                │   │
│  │ • DOM capture  │  │   extraction   │  │                │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
│         │                   │                     │             │
│         └─────────────────┬─┘─────────────────────┘             │
│                           │                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              LLM Service (GitHub Copilot)               │   │
│  │ • Action planning    • Gherkin generation               │   │
│  │ • Rule extraction    • Reconciliation prompting         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           │                                     │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐   │
│  │   Gherkin      │  │   Export       │  │   Security     │   │
│  │   Module       │  │   Module       │  │   Module       │   │
│  │                │  │                │  │                │   │
│  │ • Generation   │  │ • Confluence   │  │ • Credential   │   │
│  │ • Validation   │  │   adapter      │  │   store        │   │
│  │                │  │ • REST client  │  │ • Redaction    │   │
│  └────────────────┘  └────────────────┘  └────────────────┘   │
│                           │                                     │
│                           ▼                                     │
│                   ┌────────────────┐                           │
│                   │  Confluence    │                           │
│                   │  API Client    │                           │
│                   └────────────────┘                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
    [External Services]
    • Playwright Browser
    • LLM (GitHub Copilot)
    • GitHub API
    • Azure Repos API
    • Confluence REST API
```

### Module Breakdown

| Module | Purpose | Key Components |
|--------|---------|-----------------|
| **runs/** | Orchestration & state management | State machine, SSE controller, run lifecycle |
| **llm/** | LLM interface & isolation | LlmService port, CopilotLlmAdapter, chunking |
| **explore/** | UI automation & crawling | Playwright runner, action planner, DOM capture |
| **gherkin/** | BDD specification generation | Generator, validator, Gherkin formatter |
| **code-analyst/** | Repository analysis | GitHub/Azure connectors, ingestion, rule extraction |
| **reconcile/** | Unification & enrichment | Merge UI behavior with backend rules |
| **export/** | Confluence integration | Confluence adapter, REST client, export controller |
| **security/** | Credential & data protection | Encrypted store, PII redaction utilities |
| **config/** | Environment & feature flags | Configuration service, validation |

### LLM Isolation Pattern

All LLM calls are routed through the `LlmService` interface. Only `CopilotLlmAdapter` directly imports the GitHub Copilot SDK, ensuring:
- **Testability**: All modules can be unit tested with `MockLlmService`
- **Pluggability**: LLM providers can be swapped by implementing `LlmService`
- **Clean Dependencies**: No SDK leakage into business logic

## Project Structure

```
BAIA/
├── baia-shared/              # Shared TypeScript types & DTOs
│   └── src/
│       ├── models/           # Shared data types
│       │   ├── RunRequest.ts
│       │   ├── RunStatus.ts
│       │   ├── Gherkin.ts
│       │   ├── BusinessRule.ts
│       │   ├── Action.ts
│       │   ├── ExploreEvent.ts
│       │   └── unified-doc.ts
│       ├── guards.ts         # Type guards
│       └── index.ts          # Public API
│
├── baia-server/              # NestJS backend orchestrator
│   ├── src/
│   │   ├── main.ts           # Entry point
│   │   ├── app.module.ts     # Root module
│   │   ├── runs/             # Run orchestration
│   │   ├── llm/              # LLM service & adapters
│   │   ├── explore/          # Playwright & UI exploration
│   │   ├── gherkin/          # Gherkin generation & validation
│   │   ├── code-analyst/     # Repository analysis
│   │   ├── reconcile/        # Rule reconciliation
│   │   ├── export/           # Confluence export
│   │   ├── security/         # Credential & data protection
│   │   ├── config/           # Configuration
│   │   ├── health/           # Health checks
│   │   └── e2e/              # E2E test fixtures & mocks
│   ├── dist/                 # Compiled output
│   └── package.json
│
├── baia-ui/                  # Angular 19 frontend
│   ├── src/
│   │   ├── main.ts           # Bootstrap
│   │   ├── app/
│   │   │   ├── app.component.ts    # Root component
│   │   │   ├── app.routes.ts       # Routing config
│   │   │   ├── app.config.ts       # App config (providers)
│   │   │   ├── input/              # Input page (target URL + instructions)
│   │   │   ├── progress/           # Progress page (live event stream)
│   │   │   ├── review/             # Review page (edit & approve)
│   │   │   └── core/
│   │   │       ├── state/          # NgRx signals store
│   │   │       └── api/            # HTTP & SSE client
│   │   └── assets/
│   ├── angular.json          # Build config
│   └── package.json
│
├── e2e/                      # Playwright end-to-end tests
│   ├── playwright.config.ts
│   ├── tests/
│   └── package.json
│
├── MyCMS/                    # Sample ASP.NET MVC target app
│   ├── Controllers/
│   ├── Views/
│   └── ... (demo fixture for E2E)
│
├── .github/
│   └── workflows/
│       └── ci.yml            # GitHub Actions CI pipeline
│
├── package.json              # Root monorepo config
├── tsconfig.json             # TypeScript config
├── .prettierrc                # Code formatting
├── .eslintrc                 # Linting rules
└── README.md                 # This file
```

## Development

### Setting Up Your Environment

1. **Fork & clone** the repository
2. **Install dependencies**: `npm install`
3. **Create a branch**: `git checkout -b feature/my-feature`
4. **Develop**: Make changes, run tests frequently
5. **Format & lint**: `npm run lint`
6. **Commit**: Follow conventional commit format (e.g., `feat: add new action type`)
7. **Push & PR**: Open a pull request with a clear description

### Code Quality Standards

**All code must:**
- ✅ Pass linting (`npm run lint`)
- ✅ Pass type checking (TypeScript strict mode)
- ✅ Include unit tests (Jest/Jasmine)
- ✅ Meet coverage thresholds (see below)
- ✅ Follow code style (Prettier formatting)

### Testing Strategy

- **Unit tests**: Test individual functions and modules in isolation
- **Integration tests**: Test module interactions and business logic flows
- **E2E tests**: Test full user workflows from input to export
- **Mocks & fixtures**: Use `baia-server/src/e2e/mock-*.ts` for external dependencies

### Running the Application Locally

```bash
# Terminal 1: Start backend
cd baia-server
npm run start:dev

# Terminal 2: Start frontend
cd baia-ui
npm start

# Terminal 3 (optional): Run tests in watch mode
npm test:watch
```

Navigate to `http://localhost:4200` to access the BAIA dashboard.

## Coverage & Quality Gates

BAIA enforces strict code quality standards on every commit and pull request:

### Minimum Coverage Thresholds

| Workspace | Lines | Branches | Rationale |
|-----------|-------|----------|-----------|
| `baia-server` | ≥ 85% | ≥ 80% | Core business logic |
| `baia-ui` | ≥ 85% | ≥ 80% | User-facing features |
| **Core modules** | ≥ 90% | — | `llm/*`, `explore/*`, `reconcile/*`, `runs/*` state machine |

**Current Status** (as of 2026-06-25):

| Check | Status | Details |
|-------|--------|---------|
| **Build** | ✅ Pass | All workspaces compile successfully |
| **Lint** | ✅ Pass | ESLint + Prettier (LF line endings enforced) |
| **Backend Tests** | ✅ Pass | 827 tests, 91.9% line / 89.5% branch coverage |
| **Frontend Tests** | ✅ Pass | 108 tests, 92.3% branch coverage, all green |
| **E2E Tests** | ✅ Pass | Full workflow validation |

### Running Coverage Reports

```bash
# Generate coverage for all workspaces
npm run test

# Aggregate coverage report
npm run coverage:aggregate

# View coverage for specific workspace
npm test --workspace=baia-server -- --coverage

# Interactive coverage analysis
open coverage/index.html
```

## GitHub Actions CI/CD

Our GitHub Actions pipeline (`.github/workflows/ci.yml`) ensures code quality on every push and pull request:

1. **Lint** (`npm run lint`) — ESLint + Prettier
2. **Build** (`npm run build`) — All workspaces
3. **Unit Tests** (`npm run test`) — Jest + Karma with coverage
4. **Coverage Aggregate** (`npm run coverage:aggregate`) — Verify thresholds
5. **E2E Tests** (`npm run test:e2e`) — Full workflow validation

All checks must pass before merging to master.

## API Documentation

BAIA exposes a RESTful API with OpenAPI/Swagger documentation:

- **Docs**: `http://localhost:3000/api` (running locally)
- **Spec**: `http://localhost:3000/api-json` (OpenAPI JSON)

### Key Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/runs` | Create a new BAIA run |
| `GET` | `/runs/:id` | Fetch run details & state |
| `SSE` | `/runs/:id/events` | Stream run events in real-time |
| `POST` | `/runs/:id/start` | Start the pipeline (explore → analyze → reconcile → review) |
| `POST` | `/runs/:id/export` | Publish reviewed specifications to Confluence |
| `GET` | `/runs/:id/export/gherkin` | Download specifications as `.feature` file |
| `GET` | `/runs/:id/export/okf` | Download specifications as OKF `.zip` archive |

## Common Issues & Troubleshooting

### Chrome/Chromium Not Found
```bash
# Install browsers for Playwright
npx playwright install chromium chrome
```

### Port 3000 or 4200 Already in Use
```bash
# Use custom port
npm start -- --port 4300  # Frontend
PORT=3001 npm run start:dev  # Backend
```

### Test Failures on Windows
Ensure line endings are set to LF:
```bash
git config core.autocrlf false
npx prettier --write "src/**/*.ts"
```

### TypeScript Compilation Errors
```bash
# Clear build cache and rebuild
rm -rf dist/ node_modules/.angular
npm run build
```

## Contributing

We welcome contributions! Please:

1. Read `CONTRIBUTING.md` (if present) for detailed guidelines
2. Follow our [code quality standards](#code-quality-standards)
3. Write tests for new features
4. Update documentation as needed
5. Use conventional commit messages (e.g., `feat:`, `fix:`, `docs:`)
6. Ensure all CI checks pass before submitting PR

### Commit Message Format

```
<type>(<scope>): <subject>

<body (optional)>

<footer (optional)>
```

Examples:
- `feat(explore): add wait-for-network action support`
- `fix(gherkin): handle multi-line step descriptions`
- `docs: update README with API examples`
- `refactor(llm): extract prompt utilities to separate module`
- `test(reconcile): improve rule merging coverage`

## License

BAIA is licensed under the MIT License. See `LICENSE` file for details.

## Support & Community

- **Issues**: [GitHub Issues](https://github.com/anthropics/BAIA/issues)
- **Discussions**: [GitHub Discussions](https://github.com/anthropics/BAIA/discussions)
- **Documentation**: Full architecture docs available in `docs/` folder (when generated)

---

**BAIA** — Turning behavioral insights and code analysis into business specifications.

*Made with ❤️ by the BAIA team*
