# BAIA E2E Tests

End-to-end Playwright tests exercising the full BAIA pipeline:
**Input → Progress (SSE) → Review → Export**

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js     | ≥ 18 (for native `fetch` + `ReadableStream`) |
| npm         | ≥ 9 |
| Chromium    | installed via `npm run install:browsers` |

---

## One-time setup

```bash
# 1. Install workspace dependencies from the repo root
npm install

# 2. Build all packages (baia-shared → baia-server → baia-ui)
npm run build

# 3. Install Playwright's Chromium binary (e2e workspace)
cd e2e
npm install
npm run install:browsers
```

---

## Running the tests

```bash
# From the repo root
cd e2e
npm test
```

Playwright automatically starts three fixture servers and tears them down
after the suite completes:

| Server | Port | Purpose |
|--------|------|---------|
| `mock-mycms` | 4001 | Minimal HTML site — Playwright crawl target |
| `mock-confluence` | 4002 | Fake Confluence REST API |
| `baia-server` (E2E edition) | 3001 | Full NestJS app with `MockLlmService` |

---

## What the test covers

The single test `baia-pipeline.spec.ts` drives the pipeline end-to-end:

1. **Input** — `POST /api/runs` creates a run in `queued` state.
2. **Progress** — `GET /api/runs/:id/events` (SSE) is subscribed before the
   pipeline is triggered.  `POST /api/runs/:id/start` fires the pipeline
   asynchronously.  The test waits for the SSE stream to close (terminal state).
3. **Review** — `GET /api/runs/:id` verifies the run reached `review` state and
   carries a generated `unifiedDoc` (or `gherkinDoc`).
4. **Export** — `POST /api/runs/:id/export` pushes to the mock-confluence server
   and asserts the returned Confluence page URL.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CREDENTIAL_ENCRYPTION_KEY` | `e2e-test-key-padding-32-chars-ok!` | AES-256 key used by `CredentialStoreService` |
| `PORT` | `3001` | Port the E2E NestJS server listens on |
| `CI` | unset | When set, retries failing tests once and uses the `github` reporter |

---

## CI integration

The root CI workflow (`.github/workflows/ci.yml`) must:

1. Run `npm run build` **before** `cd e2e && npm test`.
2. Install Playwright browsers: `cd e2e && npm run install:browsers`.
3. The `baia-server/dist/e2e-server.js` entry point must exist (produced by step 1).

---

## Architecture notes

- **MockLlmService** (`baia-server/src/llm/mock-llm.service.ts`) is the sole LLM
  provider in the E2E server — all `completeJson` calls return deterministic,
  schema-valid stubs.
- **MockRepoConnector** (`baia-server/src/e2e/mock-repo-connector.ts`) replaces
  both `GitHubConnector` and `AzureConnector` so no real VCS token is required.
- **ConfluenceAdapter** points at `http://localhost:4002` (mock-confluence) via
  the `baseUrl` supplied in the export request body — no real Atlassian instance
  is contacted.
- The **E2E app module** (`baia-server/src/e2e/e2e-app.module.ts`) provides all
  providers as module-level singletons so `RunsService` state is shared across
  controllers and orchestrators.
- The **E2E start controller** (`/api/runs/:id/start`) stores test credentials
  and fires the three-phase pipeline as a background task, returning 202
  immediately.
