# BAIA Manual Test Guide

Comprehensive step-by-step instructions for manually testing the full Business AI Analyst (BAIA) system — from setup through the complete analysis pipeline to export.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Phase 0 — Environment & Configuration](#phase-0--environment--configuration)
- [Phase 1 — Build & Launch](#phase-1--build--launch)
- [Phase 2 — Backend Smoke Tests (API)](#phase-2--backend-smoke-tests-api)
- [Phase 3 — Full UI Flow (Happy Path)](#phase-3--full-ui-flow-happy-path)
- [Phase 4 — Pipeline Execution & SSE Progress](#phase-4--pipeline-execution--sse-progress)
- [Phase 5 — Review & Edit Gherkin](#phase-5--review--edit-gherkin)
- [Phase 6 — Export & Download](#phase-6--export--download)
- [Phase 7 — API-Only Tests](#phase-7--api-only-tests)
- [Phase 8 — Validation & Error Handling](#phase-8--validation--error-handling)
- [Phase 9 — Edge Cases & Resilience](#phase-9--edge-cases--resilience)
- [Phase 10 — Automated E2E Tests](#phase-10--automated-e2e-tests)
- [Troubleshooting](#troubleshooting)
- [Test Results Log](#test-results-log)

---

## Prerequisites

Before you begin, ensure you have:

| Requirement | Minimum Version | Check Command |
|---|---|---|
| **Node.js** | 18+ | `node --version` |
| **npm** | 9+ | `npm --version` |
| **Git** | Any recent | `git --version` |
| **Chrome / Chromium** | Latest | Required for Playwright |

You also need:
- A terminal (PowerShell, bash, etc.)
- **curl** or similar HTTP client (for API-only tests)
- A code editor (VS Code recommended)

---

## Phase 0 — Environment & Configuration

### 0.1 Clone the Repository

```bash
git clone https://github.com/Sparky016/BAIA.git
cd BAIA
```

### 0.2 Create the `.env` File

Create `baia-server/.env` (this file is gitignored). The server needs an LLM provider configured — choose **one** of the three modes:

#### Option A: GitHub Copilot (recommended if you have a token)

```dotenv
# baia-server/.env

PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:4200

# LLM — GitHub Copilot mode
COPILOT_TOKEN=your-github-copilot-token
COPILOT_MODEL=gpt-4o
COPILOT_MAX_RETRIES=3
COPILOT_RETRY_DELAY_MS=500

# Credential encryption (optional — auto-generated if omitted)
CREDENTIAL_ENCRYPTION_KEY=
```

#### Option B: BYOK (Bring Your Own Key)

Leave `COPILOT_TOKEN` blank and fill the BYOK section. Supported providers: `openai`, `azure`, `anthropic`.

```dotenv
# baia-server/.env

PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:4200

# LLM — BYOK mode (used when COPILOT_TOKEN is blank)
COPILOT_TOKEN=
BYOK_PROVIDER_TYPE=openai
BYOK_BASE_URL=https://api.openai.com/v1
BYOK_API_KEY=sk-your-key-here
BYOK_MODEL=gpt-4o
# BYOK_WIRE_API=completions          # optional: completions | responses
# BYOK_AZURE_API_VERSION=2024-02-15  # optional: only for azure provider

CREDENTIAL_ENCRYPTION_KEY=
```

#### Option C: Mock LLM (no credentials — dev/test fallback)

If **both** `COPILOT_TOKEN` and `BYOK_PROVIDER_TYPE` are empty, the server automatically uses `MockLlmService` — a deterministic stub that returns schema-valid fake data. This is sufficient for testing the full pipeline flow without real AI.

```dotenv
# baia-server/.env

PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:4200

# No LLM credentials → MockLlmService activates automatically
COPILOT_TOKEN=
BYOK_PROVIDER_TYPE=

CREDENTIAL_ENCRYPTION_KEY=
```

#### Optional: Repository Analysis (Phase 2 of the pipeline)

To test code analysis, add repository details:

```dotenv
# Appended to your .env
REPO_URL=https://github.com/your-org/your-repo
REPO_PROVIDER=github
REPO_ACCESS_TOKEN=ghp_your-github-pat
```

> **Note:** If `REPO_URL` is omitted, the pipeline skips Phase 2 (code analysis) and proceeds directly to reconciliation with explore-only data.

### 0.3 Generate a Credential Encryption Key (optional)

If you want to explicitly set the encryption key:

```bash
# Node.js one-liner
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# PowerShell
[System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

Set the output as `CREDENTIAL_ENCRYPTION_KEY` in `.env`. If omitted, the server auto-generates a random key at startup.

### ✅ Verify Configuration

- [ ] `.env` file exists in `baia-server/`
- [ ] At least one LLM mode is configured (or intentionally using mock)
- [ ] You understand which LLM mode will be active

---

## Phase 1 — Build & Launch

### 1.1 Install Dependencies

```bash
# From the BAIA root directory
npm install
```

### 1.2 Build All Workspaces

```bash
npm run build
```

This builds in dependency order: `baia-shared` → `baia-server` → `baia-ui`.

### 1.3 Start the Backend (Terminal 1)

```bash
cd baia-server
npm run start:dev
```

**Expected output:**
```
[Nest] LOG [Bootstrap] CORS enabled for origin: http://localhost:4200
[Nest] LOG [Bootstrap] BAIA server listening on port 3000
[Nest] LOG [Bootstrap] Swagger docs available at http://localhost:3000/api-docs
```

### 1.4 Start the Frontend (Terminal 2)

```bash
cd baia-ui
npm start
```

**Expected output:**
```
✔ Compiled successfully.
- Local: http://localhost:4200
```

The Angular dev server proxies all `/api` requests to `http://localhost:3000`.

### ✅ Verify Launch

- [ ] Backend is running on port 3000
- [ ] Frontend is running on port 4200
- [ ] No errors in either terminal

---

## Phase 2 — Backend Smoke Tests (API)

Before touching the UI, verify the backend is healthy.

### Test 2.1: Health Check

```bash
curl -i http://localhost:3000/api/health
```

**Expected:**
```
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok"}
```

### Test 2.2: Swagger Documentation

1. Open a browser and navigate to `http://localhost:3000/api-docs`

**Verify:**
- [ ] Swagger UI loads with "BAIA API" title
- [ ] Endpoints listed: `GET /health`, `POST /runs`, `GET /runs`, `GET /runs/{id}`, `GET /runs/{id}/events`, `POST /runs/{id}/start`, `POST /runs/{id}/export`, `GET /runs/{id}/export/gherkin`, `GET /runs/{id}/export/okf`
- [ ] Each endpoint shows request/response schemas
- [ ] "Try it out" buttons are functional

### Test 2.3: Create a Run via API

```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com",
    "instructions": "Click the login button, fill in credentials, and verify the dashboard loads."
  }'
```

**Expected:**
```
HTTP/1.1 201 Created
Content-Type: application/json

{
  "runId": "run-0001",
  "status": "queued",
  "targetUrl": "https://example.com",
  "createdAt": "...",
  "updatedAt": "..."
}
```

**Verify:**
- [ ] `runId` follows the pattern `run-NNNN`
- [ ] `status` is `"queued"`
- [ ] `targetUrl` matches input

### Test 2.4: Retrieve a Run

```bash
curl -i http://localhost:3000/api/runs/run-0001
```

**Expected:** HTTP 200 with the full run summary matching what was created.

### Test 2.5: List All Runs

```bash
curl -i http://localhost:3000/api/runs
```

**Expected:** HTTP 200 with an array containing all runs created during this session.

### Test 2.6: Run Not Found

```bash
curl -i http://localhost:3000/api/runs/nonexistent-123
```

**Expected:** HTTP 404 with message: `"Run 'nonexistent-123' not found."`

---

## Phase 3 — Full UI Flow (Happy Path)

Test the complete user journey through the Angular frontend.

### Test 3.1: Navigate to Input Page

1. Open `http://localhost:4200` in Chrome

**Verify:**
- [ ] Automatically redirected to `/input`
- [ ] Page title: "Start BAIA **Analysis**"
- [ ] Navigation bar shows "New Analysis" link
- [ ] Form fields visible: Target URL, Instructions
- [ ] Expandable "Repository (optional)" section with: Repository URL, Provider dropdown, Credentials reference
- [ ] "Start BAIA" button is **disabled** (form is invalid)

### Test 3.2: Fill Required Fields

1. Enter `https://example.com` in **Target URL**
2. Enter `Click the login button and verify dashboard appears.` in **Instructions**
3. Leave the Repository section collapsed/empty

**Verify:**
- [ ] "Start BAIA" button becomes **enabled**
- [ ] No red validation error messages visible

### Test 3.3: Submit the Form

1. Click **"Start BAIA"**

**Verify:**
- [ ] Button text changes to `"Starting…"` and is disabled
- [ ] Browser navigates to `/progress/run-XXXX`
- [ ] Run ID is displayed (e.g. `run-0001`)
- [ ] Backend terminal shows: `POST /runs — targetUrl=https://example.com` and `Run accepted: run-0001`

### Test 3.4: Observe Progress Page Layout

After submitting, you land on the progress page.

**Verify:**
- [ ] Header shows "BAIA Analysis" with a run ID chip (e.g. `Run: run-0001`)
- [ ] **Phase stepper** bar is visible with phases: `exploring → analyzing → reconciling → review → done`
- [ ] **Current operation strip** shows status and operation message
- [ ] Event log area is visible (may show "Waiting for events…" initially)
- [ ] If pipeline starts: events appear in the log with timestamps, badges (action/navigate/info/error), and messages
- [ ] If pipeline starts: **Live preview** screenshot panel appears on the right when screenshots arrive

### Test 3.5: Pipeline Auto-Start

When you navigate to the progress page, the UI automatically calls `POST /api/runs/{id}/start` to trigger the pipeline.

**What to expect depends on your LLM configuration:**

| LLM Mode | Behavior |
|---|---|
| **Mock LLM** (no credentials) | Pipeline runs with deterministic fake data. Completes in ~5–15 seconds. Events stream in via SSE. |
| **Copilot / BYOK** (real LLM) | Pipeline runs with real AI. May take 30–120+ seconds depending on target site complexity. |
| **No target accessible** | If `https://example.com` is used, Playwright will capture minimal data. The pipeline still completes. |

**Verify during pipeline execution:**
- [ ] Status transitions are visible: `queued → exploring → analyzing → reconciling → review`
- [ ] Events appear in the event log (action, navigate, info events)
- [ ] Phase stepper highlights the active phase
- [ ] Step counter increments as action events arrive

### Test 3.6: Automatic Navigation to Review

When the pipeline reaches the `review` state, the UI automatically navigates to `/review/run-XXXX`.

**Verify:**
- [ ] Browser URL changes to `/review/run-XXXX`
- [ ] Review page loads (see Phase 5 below for detailed review testing)

### Test 3.7: Navigation — Return to Input

1. Click the **"New Analysis"** link in the navigation bar

**Verify:**
- [ ] Returns to `/input`
- [ ] Form is clean/reset

---

## Phase 4 — Pipeline Execution & SSE Progress

Test the Server-Sent Events stream and pipeline execution independently.

### Test 4.1: SSE Stream via curl

1. Create a run via API:
   ```bash
   curl -s -X POST http://localhost:3000/api/runs \
     -H "Content-Type: application/json" \
     -d '{"targetUrl": "https://example.com", "instructions": "Navigate the homepage."}'
   ```
2. Note the returned `runId` (e.g. `run-0002`)
3. In a **separate terminal**, connect to the SSE stream:
   ```bash
   curl -N http://localhost:3000/api/runs/run-0002/events
   ```
4. In another terminal, trigger the pipeline:
   ```bash
   curl -i -X POST http://localhost:3000/api/runs/run-0002/start \
     -H "Content-Type: application/json" \
     -d '{"instructions": "Navigate the homepage."}'
   ```

**Expected:**
- [ ] Start endpoint returns `HTTP 202 Accepted` with `{"accepted":true,"runId":"run-0002"}`
- [ ] SSE terminal begins receiving `data:` frames with JSON payloads
- [ ] Events include state transitions (`queued → exploring → analyzing → ...`)
- [ ] Events include explore events (action, navigate, info, screenshot types)
- [ ] SSE stream closes when the run reaches `review` state

### Test 4.2: SSE Connection in Browser Dev Tools

1. Navigate to `/progress/run-XXXX` in Chrome
2. Open **Dev Tools → Network** tab
3. Filter by "EventStream" or look for `events` request

**Verify:**
- [ ] SSE request to `/api/runs/run-XXXX/events` exists
- [ ] Status: `200`
- [ ] Type: `text/event-stream`
- [ ] EventStream tab shows individual events as they arrive

---

## Phase 5 — Review & Edit Gherkin

After the pipeline completes and reaches `review` state, test the review page.

### Test 5.1: Review Page Layout

Navigate to `/review/run-XXXX` (either automatically after pipeline completes, or manually via URL).

**Verify:**
- [ ] Header shows "Review **Gherkin**"
- [ ] **Approve** button is visible and says "Approve" (not yet pressed)
- [ ] **Gherkin Editor** shows generated features and scenarios (or "No Gherkin document available." if pipeline hasn't run)
- [ ] **Export panel** is visible with two sections:
  - "Sync to Confluence" with Base URL, Space Key, Credentials Reference fields
  - "Download Assets" with Gherkin (.feature) and OKF Bundle (.zip) buttons

### Test 5.2: Gherkin Editor (if pipeline has generated data)

**Verify:**
- [ ] Features are displayed with "Feature:" keyword and editable name input
- [ ] Feature descriptions are shown (if any)
- [ ] Scenarios are nested under features with "Scenario:" keyword and editable name
- [ ] Steps show keyword (Given/When/Then), editable text, and a provenance badge

### Test 5.3: Edit Gherkin

1. Click on a feature name input and change the text
2. Click on a scenario name and change it
3. Click on a step text and modify it

**Verify:**
- [ ] All fields are editable inline
- [ ] Changes are reflected immediately in the UI
- [ ] Approval state resets (button shows "Approve" again) after edits

### Test 5.4: Approve Gherkin

1. Click the **"Approve"** button

**Verify:**
- [ ] Button text changes to **"Approved"**
- [ ] `aria-pressed` attribute is `"true"` (inspect via Dev Tools)
- [ ] Button becomes **disabled** (cannot un-approve)
- [ ] Confluence export fields become **enabled**
- [ ] Download buttons become **enabled**

### Test 5.5: Export Fields Before Approval

1. Navigate to `/review/run-XXXX` on a run that hasn't been approved yet

**Verify:**
- [ ] Confluence Base URL, Space Key, and Credentials Reference fields are **disabled**
- [ ] "Export to Confluence" button is **disabled**
- [ ] "Download Gherkin (.feature)" button is **disabled**
- [ ] "Download OKF Bundle (.zip)" button is **disabled**

---

## Phase 6 — Export & Download

### Test 6.1: Download Gherkin File

Prerequisites: Run is in `review` state with a generated document, and Gherkin is approved.

1. Click **"Download Gherkin (.feature)"** button

**Verify:**
- [ ] Browser downloads a `.feature` file
- [ ] File contains valid Gherkin syntax (`Feature:`, `Scenario:`, `Given/When/Then`)
- [ ] Filename is derived from the first feature name

### Test 6.2: Download OKF Bundle

1. Click **"Download OKF Bundle (.zip)"** button

**Verify:**
- [ ] Browser downloads a `.zip` file
- [ ] Filename ends with `-okf.zip`
- [ ] ZIP contains the OKF bundle structure

### Test 6.3: Download via API

```bash
# Download Gherkin file
curl -i http://localhost:3000/api/runs/run-0001/export/gherkin

# Download OKF bundle
curl -i http://localhost:3000/api/runs/run-0001/export/okf
```

**Expected:**
- [ ] Gherkin: `Content-Type: text/plain` with `.feature` extension in `Content-Disposition`
- [ ] OKF: `Content-Type: application/zip` with `.zip` extension in `Content-Disposition`

### Test 6.4: Export to Confluence via API

> **Note:** This requires either a real Confluence instance or the mock Confluence server (`node e2e/helpers/mock-confluence-server.mjs` on port 4002).

```bash
curl -i -X POST http://localhost:3000/api/runs/run-0001/export \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "http://localhost:4002",
    "spaceKey": "ENG",
    "credentialsRef": "confluence-creds"
  }'
```

**Expected (with mock server):** HTTP 200 with `{"url":"http://localhost:4002/wiki/..."}`.

**Expected (without Confluence):** Connection refused error.

### Test 6.5: Export to Confluence via UI

Prerequisites: Run approved in the review page, mock Confluence server running.

1. Enter Confluence Base URL: `http://localhost:4002`
2. Enter Space Key: `ENG`
3. Enter Credentials Reference: `confluence-creds`
4. Click **"Export to Confluence"**

**Verify:**
- [ ] Button text changes to "Syncing..."
- [ ] On success: green success message with a link to the Confluence page
- [ ] On failure: red error message displayed

### Test 6.6: Export State Guard

```bash
# Try to export a run that is still in "queued" state
curl -i -X POST http://localhost:3000/api/runs/run-XXXX/export \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://mycompany.atlassian.net",
    "spaceKey": "ENG",
    "credentialsRef": "confluence-creds"
  }'
```

**Expected:** HTTP 409 Conflict:
```
"Export is only allowed when run is in 'review' state; current state is 'queued'."
```

---

## Phase 7 — API-Only Tests

These tests verify API behavior independent of the UI.

### Test 7.1: Swagger Interactive Testing

1. Open `http://localhost:3000/api-docs`
2. Find `POST /api/runs` → click **"Try it out"**
3. Enter:
   ```json
   {
     "targetUrl": "https://example.com",
     "instructions": "Test from Swagger UI"
   }
   ```
4. Click **"Execute"**

**Verify:** HTTP 201 with run details.

5. Find `GET /api/runs/{id}` → enter the returned `runId` → Execute

**Verify:** HTTP 200 with full run summary.

### Test 7.2: Create Run with All Optional Fields

```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com",
    "instructions": "Explore the admin panel.",
    "repoUrl": "https://github.com/org/repo",
    "repoProvider": "github",
    "credentialsRef": "my-pat"
  }'
```

**Expected:** HTTP 201 with all fields accepted.

### Test 7.3: Pipeline Start via API

```bash
curl -i -X POST http://localhost:3000/api/runs/run-XXXX/start \
  -H "Content-Type: application/json" \
  -d '{"instructions": "Navigate and document the page."}'
```

**Expected:** HTTP 202 Accepted:
```json
{"accepted":true,"runId":"run-XXXX"}
```

The pipeline runs asynchronously in the background.

---

## Phase 8 — Validation & Error Handling

### Test 8.1: Missing Required Fields

```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected:** HTTP 400 with errors for `targetUrl` and `instructions`.

### Test 8.2: Empty Target URL

```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{"targetUrl": "", "instructions": "Do something."}'
```

**Expected:** HTTP 400, error for `targetUrl`.

### Test 8.3: Invalid URL Format

```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{"targetUrl": "not-a-url", "instructions": "Do something."}'
```

**Expected:** HTTP 400, error: `"targetUrl must be a valid http or https URL."`

### Test 8.4: Invalid Repo Provider

```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com",
    "instructions": "Do something.",
    "repoProvider": "gitlab"
  }'
```

**Expected:** HTTP 400, error for `repoProvider` (must be `"github"` or `"azure"`).

### Test 8.5: Non-JSON Body

```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d 'not-json'
```

**Expected:** HTTP 400 (NestJS parse error).

### Test 8.6: No Body

```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json"
```

**Expected:** HTTP 400.

### Test 8.7: UI Form Validation — Empty Target URL

1. Click into the **Target URL** field
2. Click out (blur) without typing

**Expected:** Red error text: "Enter a valid URL starting with http:// or https://"

### Test 8.8: UI Form Validation — Invalid URL

1. Type `not-a-url` in Target URL
2. Click out

**Expected:** Same validation error shown.

### Test 8.9: UI Form Validation — Empty Instructions

1. Click into the **Instructions** field
2. Click out without typing

**Expected:** Red error text: "Instructions are required"

### Test 8.10: UI Form Validation — Button State

1. Clear all fields

**Verify:** "Start BAIA" button is **disabled**.

2. Fill valid Target URL and Instructions

**Verify:** "Start BAIA" button is **enabled**.

---

## Phase 9 — Edge Cases & Resilience

### Test 9.1: Backend Not Running

1. Stop the backend server (Ctrl+C in Terminal 1)
2. Navigate to `http://localhost:4200`
3. Fill form and click "Start BAIA"

**Expected:**
- [ ] Error message appears on the form (red `submit-error` text)
- [ ] The application does not crash

4. Restart the backend before continuing.

### Test 9.2: Invalid Run ID in URL

1. Navigate to `http://localhost:4200/progress/invalid-id`

**Expected:** Page loads but shows `invalid-id` as the run ID with "Waiting for events…" message.

### Test 9.3: Special Characters in Instructions

```bash
curl -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com",
    "instructions": "Test <script>alert(1)</script> & special chars: ñöüß"
  }'
```

**Expected:** HTTP 201 — instructions accepted without XSS or encoding issues.

### Test 9.4: Very Long URL

```bash
curl -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com/very/long/path/with/many/segments/and?query=params&test=true",
    "instructions": "Navigate through the entire page."
  }'
```

**Expected:** HTTP 201 — long URLs accepted.

### Test 9.5: Port Already in Use

1. Start the backend on port 3000
2. Try starting another instance on the same port

**Expected:** Error: "port 3000 is already in use"

**Resolution:**
```bash
PORT=3001 npm run start:dev
```

### Test 9.6: Download Without Document

```bash
curl -i http://localhost:3000/api/runs/run-XXXX/export/gherkin
```

(Where `run-XXXX` is a run still in `queued` state with no generated document.)

**Expected:** HTTP 400: `"Run has no document to export."`

### Test 9.7: Browser Console Errors

1. Open **Dev Tools → Console** tab
2. Navigate through all pages: `/input` → `/progress/run-XXXX` → `/review/run-XXXX`

**Verify:** No unhandled JavaScript errors or 404s.

### Test 9.8: Proxy Verification

1. Open **Dev Tools → Network** tab
2. Navigate to `/input`, fill form, and click "Start BAIA"
3. Find the `POST /api/runs` request

**Verify:**
- [ ] Request goes to `localhost:4200/api/runs` (proxied to `localhost:3000`)
- [ ] Request payload matches form data
- [ ] Response JSON contains the run summary

---

## Phase 10 — Automated E2E Tests

The project includes Playwright E2E tests that validate the full pipeline with mock services.

### 10.1: Install Playwright Browsers (one-time)

```bash
cd e2e
npm install
npm run install:browsers
```

### 10.2: Run E2E Tests

```bash
# From the BAIA root
npm run test:e2e
```

Or directly:

```bash
cd e2e
npm test
```

### What the E2E Tests Do

The E2E test suite automatically starts three fixture servers:

| Server | Port | Purpose |
|---|---|---|
| `mock-mycms` | 4001 | Minimal HTML site — Playwright crawl target |
| `mock-confluence` | 4002 | Fake Confluence REST API |
| `baia-server` (E2E) | 3001 | Full NestJS app with `MockLlmService` |

The test (`e2e/tests/baia-pipeline.spec.ts`) drives the full pipeline:

1. **Input** — `POST /api/runs` creates a run in `queued` state
2. **Progress** — `GET /api/runs/:id/events` (SSE) is subscribed, then `POST /api/runs/:id/start` triggers the pipeline. Test waits for SSE stream to close.
3. **Review** — `GET /api/runs/:id` verifies `review` state with generated `unifiedDoc` or `gherkinDoc`
4. **Export** — `POST /api/runs/:id/export` pushes to mock Confluence and asserts the returned page URL

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| Backend won't start | Port 3000 in use | `PORT=3001 npm run start:dev` or kill the existing process |
| Frontend shows blank page | Backend not running | Start the backend in another terminal |
| API calls fail with CORS | `CORS_ORIGIN` mismatch | Ensure `.env` has `CORS_ORIGIN=http://localhost:4200` |
| Stale builds | Outdated compiled files | Run `npm run build` from root |
| Node version errors | Wrong Node.js version | Use Node 18+ |
| Form submit does nothing | API errors | Check browser console and backend terminal for errors |
| Pipeline hangs | LLM timeout / Playwright issue | Check backend logs for error details; try Mock LLM mode |
| `MockLlmService` used unexpectedly | No LLM credentials configured | Set `COPILOT_TOKEN` or `BYOK_*` variables in `.env` |
| Playwright browser not found | Chromium not installed | Run `npx playwright install chromium` |
| SSE connection drops | Backend restart / network issue | Refresh the progress page to reconnect |
| Export returns 409 | Run not in `review` state | Complete the pipeline first, or wait for `review` status |
| Download returns 400 | No generated document | Ensure the pipeline completed and a Gherkin doc was generated |

---

## Test Results Log

Use this template to record your test results:

```
Date: _______________
Tester: _____________
LLM Mode: Mock / Copilot / BYOK (________)
Environment: Windows / macOS / Linux
Browser: Chrome _____ / Firefox _____ / Edge _____
Node.js: v_______

| Phase | Test #  | Description                        | Pass/Fail | Notes |
|-------|---------|------------------------------------|-----------|-------|
| 0     | 0.2     | .env file created                  |           |       |
| 1     | 1.1     | npm install                        |           |       |
| 1     | 1.2     | npm run build                      |           |       |
| 1     | 1.3     | Backend started                    |           |       |
| 1     | 1.4     | Frontend started                   |           |       |
| 2     | 2.1     | Health check                       |           |       |
| 2     | 2.2     | Swagger docs                       |           |       |
| 2     | 2.3     | Create run (API)                   |           |       |
| 2     | 2.4     | Retrieve run                       |           |       |
| 2     | 2.5     | List all runs                      |           |       |
| 2     | 2.6     | Run not found                      |           |       |
| 3     | 3.1     | Input page layout                  |           |       |
| 3     | 3.2     | Fill required fields               |           |       |
| 3     | 3.3     | Submit form                        |           |       |
| 3     | 3.4     | Progress page layout               |           |       |
| 3     | 3.5     | Pipeline auto-start                |           |       |
| 3     | 3.6     | Auto-navigate to review            |           |       |
| 3     | 3.7     | Navigation back to input           |           |       |
| 4     | 4.1     | SSE stream via curl                |           |       |
| 4     | 4.2     | SSE in browser dev tools           |           |       |
| 5     | 5.1     | Review page layout                 |           |       |
| 5     | 5.2     | Gherkin editor display             |           |       |
| 5     | 5.3     | Edit Gherkin                       |           |       |
| 5     | 5.4     | Approve Gherkin                    |           |       |
| 5     | 5.5     | Export fields before approval      |           |       |
| 6     | 6.1     | Download Gherkin file              |           |       |
| 6     | 6.2     | Download OKF bundle                |           |       |
| 6     | 6.3     | Download via API                   |           |       |
| 6     | 6.4     | Export to Confluence (API)         |           |       |
| 6     | 6.5     | Export to Confluence (UI)          |           |       |
| 6     | 6.6     | Export state guard                 |           |       |
| 7     | 7.1     | Swagger interactive                |           |       |
| 7     | 7.2     | All optional fields                |           |       |
| 7     | 7.3     | Pipeline start via API             |           |       |
| 8     | 8.1-8.6 | API validation errors             |           |       |
| 8     | 8.7-8.10| UI form validation                |           |       |
| 9     | 9.1     | Backend not running                |           |       |
| 9     | 9.2     | Invalid run ID in URL              |           |       |
| 9     | 9.3     | Special characters                 |           |       |
| 9     | 9.4     | Very long URL                      |           |       |
| 9     | 9.5     | Port conflict                      |           |       |
| 9     | 9.6     | Download without document          |           |       |
| 9     | 9.7     | Console errors                     |           |       |
| 9     | 9.8     | Proxy verification                 |           |       |
| 10    | 10.2    | Automated E2E suite                |           |       |
```
