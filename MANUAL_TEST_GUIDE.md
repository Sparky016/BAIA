# BAIA Manual Test Guide

End-to-end manual test instructions for the Business AI Analyst (BAIA) application.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup & Running the App](#setup--running-the-app)
- [Test Data: MyCMS Sample App](#test-data-mycms-sample-app)
- [Test 1: Health Check (API)](#test-1-health-check-api)
- [Test 2: Create a Run (API)](#test-2-create-a-run-api)
- [Test 3: Validation Errors (API)](#test-3-validation-errors-api)
- [Test 4: Run Not Found (API)](#test-4-run-not-found-api)
- [Test 5: Swagger Docs (API)](#test-5-swagger-docs-api)
- [Test 6: Full UI Flow — Happy Path](#test-6-full-ui-flow--happy-path)
- [Test 7: UI Form Validation](#test-7-ui-form-validation)
- [Test 8: Progress Page — SSE Events](#test-8-progress-page--sse-events)
- [Test 9: Export via API (No Confluence)](#test-9-export-via-api-no-confluence)
- [Test 10: Export via UI](#test-10-export-via-ui)
- [Test 11: List All Runs (API)](#test-11-list-all-runs-api)
- [Test 12: Approve & Re-export](#test-12-approve--re-export)
- [Test 13: Browser Dev Tools — Network & SSE Inspection](#test-13-browser-dev-tools--network--sse-inspection)
- [Test 14: Error & Edge Cases](#test-14-error--edge-cases)
- [Test 15: Swagger UI Interactive Testing](#test-15-swagger-ui-interactive-testing)
- [Running Automated E2E Tests](#running-automated-e2e-tests)

---

## Prerequisites

- **Node.js** 18+ (check: `node --version`)
- **npm** 9+ (check: `npm --version`)
- **Chrome** or **Chromium** (for Playwright browser automation)
- **Git**
- A terminal (PowerShell, bash, etc.)
- **curl** or similar HTTP client (for API-only tests)

---

## Setup & Running the App

### 1. Install dependencies

```bash
# From the BAIA root directory
cd BAIA
npm install
```

### 2. Build all workspaces

```bash
npm run build
```

### 3. Start the backend (Terminal 1)

```bash
cd baia-server
npm run start:dev
```

Expected output:
```
[Nest] LOG [Bootstrap] BAIA server listening on port 3000
[Nest] LOG [Bootstrap] Swagger docs available at http://localhost:3000/api-docs
```

### 4. Start the frontend (Terminal 2)

```bash
cd baia-ui
npm start
```

Expected output:
```
✔ Compiled successfully.
- Local: http://localhost:4200
```

The Angular dev server proxies `/api` requests to `http://localhost:3000`.

---

## Test Data: MyCMS Sample App

The `MyCMS/` directory contains a sample ASP.NET MVC 5 application used as a target for exploration. It runs in-memory and is **not** served by default. For manual testing you have two options:

**Option A:** Use a live URL (e.g. `https://example.com`) as the target — the exploration phase will navigate it via Playwright.

**Option B:** Use `http://localhost:4001` if you run the mock CMS server (used in E2E tests):

```bash
node e2e/helpers/mock-mycms-server.mjs
```

---

## Test 1: Health Check (API)

Verify the backend is running.

**Steps:**
1. Open a terminal or browser
2. Hit the health endpoint

```bash
curl -i http://localhost:3000/api/health
```

**Expected result:**
```
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok"}
```

---

## Test 2: Create a Run (API)

Test creating a new BAIA analysis run via the REST API.

**Steps:**

```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com",
    "instructions": "Click the login button, fill in credentials, and verify the dashboard loads."
  }'
```

**Expected result:**
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
- `runId` follows the pattern `run-NNNN`
- `status` is `"queued"`
- `targetUrl` matches the input

---

## Test 3: Validation Errors (API)

Confirm the API rejects invalid payloads.

### 3a. Missing required fields

```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected:** HTTP 400 with errors for `targetUrl` and `instructions`.

### 3b. Empty targetUrl

```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{"targetUrl": "", "instructions": "Do something."}'
```

**Expected:** HTTP 400, error for `targetUrl`.

### 3c. Invalid URL format

```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{"targetUrl": "not-a-url", "instructions": "Do something."}'
```

**Expected:** HTTP 400, error for `targetUrl` ("must be a valid http or https URL").

### 3d. Invalid repoProvider

```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com",
    "instructions": "Do something.",
    "repoProvider": "gitlab"
  }'
```

**Expected:** HTTP 400, error for `repoProvider`.

### 3e. Run with all optional fields

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

---

## Test 4: Run Not Found (API)

Verify 404 for nonexistent runs.

```bash
curl -i http://localhost:3000/api/runs/nonexistent-123
```

**Expected:** HTTP 404 with message: `"Run 'nonexistent-123' not found."`

---

## Test 5: Swagger Docs (API)

Verify the OpenAPI/Swagger documentation page loads.

**Steps:**
1. Open a browser
2. Navigate to `http://localhost:3000/api-docs`

**Expected result:**
- Swagger UI page loads with BAIA API documentation
- All endpoints are listed: `GET /health`, `POST /runs`, `GET /runs`, `GET /runs/{id}`, `GET /runs/{id}/events`, `POST /runs/{id}/export`
- Each endpoint shows request/response schemas
- Try clicking "Try it out" on `POST /runs` — it should work interactively

---

## Test 6: Full UI Flow — Happy Path

Test the complete user journey through the Angular frontend.

**Prerequisites:**
- Backend running on port 3000
- Frontend running on port 4200

**Steps:**

### 6a. Navigate to Input Page
1. Open `http://localhost:4200` in Chrome
2. You should be redirected to `/input`

**Verify:**
- URL shows `/input`
- Page title: "Start BAIA Analysis"
- Form fields visible: Target URL, Instructions, Repository URL, Repository Provider, Credentials Reference
- "Start BAIA" button is present and **disabled** (form is invalid without required fields)

### 6b. Fill Required Fields
1. Enter `https://example.com` in Target URL
2. Enter `Click the login button and verify dashboard appears.` in Instructions
3. Leave Repository URL and Credentials Reference empty
4. Leave Repository Provider at default ("GitHub")

**Verify:**
- "Start BAIA" button becomes **enabled**
- No red validation error messages visible

### 6c. Submit the Form
1. Click **"Start BAIA"**
2. Button text changes to `"Starting…"`

**Expected:**
- Browser navigates to `/progress/run-XXXX`
- Run ID is displayed (e.g. `run-0001`)
- Status shows `"queued"`
- "Waiting for events…" message visible

### 6d. Observe Progress Page
**Note:** Currently the production backend does **not** auto-start the pipeline (the `/start` endpoint is only wired in the E2E server). So the status will remain `"queued"` and no events will arrive via SSE. This is expected behavior.

**Verify:**
- Run ID shown correctly
- Status displays `queued`
- Backend logs show the run was created

### 6e. Navigate to Review Page (via URL)
1. Manually navigate to `http://localhost:4200/review/run-XXXX` (use the actual run ID)

**Expected:**
- Review page loads
- "No Gherkin document available." message (since pipeline hasn't generated one yet)
- Approve button is visible
- Export panel is visible with disabled fields

### 6f. Page Navigation
1. Click the **"New Analysis"** link in the nav bar

**Expected:**
- Returns to `/input`
- Form is clean/reset

---

## Test 7: UI Form Validation

Verify all validation rules work in the frontend.

### 7a. Empty Target URL
1. Click into Target URL field
2. Click out (blur) without typing anything
3. **Expected:** Red error text: "Enter a valid URL starting with http:// or https://"

### 7b. Invalid URL
1. Type `not-a-url` in Target URL
2. Click out
3. **Expected:** Same validation error shown

### 7c. Empty Instructions
1. Click into Instructions field
2. Click out without typing
3. **Expected:** Red error text: "Instructions are required"

### 7d. Button State
1. Clear all fields (so form is invalid)
2. **Verify:** "Start BAIA" button is **disabled**
3. Fill valid Target URL and Instructions
4. **Verify:** "Start BAIA" button is **enabled**

---

## Test 8: Progress Page — SSE Events

Test the Server-Sent Events stream directly (bypasses /start requirement).

**Steps:**
1. Create a run via API (see Test 2)
2. Connect to the SSE stream: `curl -N http://localhost:3000/api/runs/run-0001/events`

**Expected:**
- `curl` hangs waiting for events (SSE connection stays open)
- No events are emitted until the pipeline runs (which requires the /start endpoint wired)

**Verify frontend SSE connection:**
1. Navigate to `/progress/run-XXXX` in browser
2. Open Dev Tools → Network tab
3. Filter by "Events" or look for `events` request
4. **Verify:** An SSE request to `/api/runs/run-XXXX/events` exists with status `200` and type `text/event-stream`

---

## Test 9: Export via API (No Confluence)

Test the export endpoint.

**Note:** The `/start` endpoint is not wired in production, so runs remain in `queued` status and cannot be exported (export requires `review` status). This test validates the error handling.

### 9a. Export from queued state

```bash
curl -i -X POST http://localhost:3000/api/runs/run-0001/export \
  -H "Content-Type: application/json" \
  -d '{
    "baseUrl": "https://mycompany.atlassian.net",
    "spaceKey": "ENG",
    "credentialsRef": "confluence-creds"
  }'
```

**Expected:** HTTP 409 Conflict with message:
```
"Export is only allowed when run is in 'review' state; current state is 'queued'."
```

**Note:** Full export testing requires the pipeline to be wired and a real Confluence instance (or the mock server run on port 4002).

---

## Test 10: Export via UI

### 10a. Export fields disabled before approval
1. Navigate to `/review/run-XXXX`
2. **Verify:** Confluence Base URL, Space Key, and Credentials Reference fields are **disabled**
3. **Verify:** "Export to Confluence" button is **disabled**

### 10b. Export panel layout
1. Verify the Export panel has:
   - Heading: "Export to Confluence"
   - Input for Confluence Base URL
   - Input for Space Key
   - Input for Credentials Reference
   - "Export to Confluence" button
   - Error/success message areas

---

## Test 11: List All Runs (API)

```bash
curl -i http://localhost:3000/api/runs
```

**Expected:** HTTP 200 with an array of all run summaries created during the session. Each entry contains `runId`, `status`, `targetUrl`, `createdAt`, `updatedAt`.

---

## Test 12: Approve & Re-export

**Note:** This test validates the approve interaction in the UI. Since the pipeline isn't wired, the export won't complete, but the approval toggle can be tested.

1. Navigate to `/review/run-XXXX`
2. Click **"Approve"**
3. **Expected:** Button text changes to `"Approved"` and `aria-pressed` attribute is `true`
4. Click again if toggle behavior exists (check button state)
5. With approval active, enter export config fields (but expect export to fail without a real Confluence instance or proper run state)

---

## Test 13: Browser Dev Tools — Network & SSE Inspection

### 13a. Watch API calls
1. Open Chrome Dev Tools (F12) → Network tab
2. Navigate to `/input`, fill form, and click "Start BAIA"
3. In Network tab, find the `POST /api/runs` request
4. **Verify:** Request payload matches the form data
5. **Verify:** Response JSON contains the run summary

### 13b. Verify proxy configuration
1. Check that API calls go to `localhost:4200/api/runs` (proxied to `localhost:3000`)
2. Network tab should show requests to `http://localhost:4200/api/runs`

### 13c. Console errors
1. Open Console tab in Dev Tools
2. Navigate through all pages
3. **Verify:** No unhandled errors or 404s logged

---

## Test 14: Error & Edge Cases

### 14a. Backend not running
1. Stop the backend server
2. Navigate to `http://localhost:4200`
3. Fill form and click "Start BAIA"
4. **Expected:** An error message appears on the form (e.g. `submit-error` test-id element with an error). The API call fails gracefully.
5. Restart the backend before continuing.

### 14b. Invalid run ID in URL
1. Navigate to `http://localhost:4200/progress/invalid-id`
2. **Expected:** Page still loads but may show unknown run info or a generic display

### 14c. Special characters in instructions
1. Create a run via API with special characters in instructions:
```bash
curl -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com",
    "instructions": "Test <script>alert(1)</script> & special chars: ñöüß"
  }'
```
2. **Expected:** HTTP 201 — instructions accepted without XSS or encoding issues

### 14d. Very long URL
1. Create a run with a long target URL:
```bash
curl -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com/very/long/path/with/many/segments/and?query=params&test=true",
    "instructions": "Navigate through the entire page."
  }'
```
2. **Expected:** HTTP 201 — long URLs accepted

### 14e. Non-JSON body
```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d 'not-json'
```
**Expected:** HTTP 400 (NestJS built-in parse error)

### 14f. No body
```bash
curl -i -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json"
```
**Expected:** HTTP 400

### 14g. Port already in use
1. Start the backend on 3000
2. Try starting another instance on the same port
3. **Expected:** Error: "port 3000 is already in use"
4. Resolution: Use a different port:
   ```bash
   PORT=3001 npm run start:dev
   ```

---

## Test 15: Swagger UI Interactive Testing

1. Open `http://localhost:3000/api-docs` in browser
2. Find the `POST /api/runs` endpoint
3. Click **"Try it out"**
4. Enter a valid JSON request body:
   ```json
   {
     "targetUrl": "https://example.com",
     "instructions": "Test from Swagger UI"
   }
   ```
5. Click **"Execute"**
6. **Expected:** HTTP 201 response with run details
7. Find the `GET /api/runs/{id}` endpoint
8. Enter the returned `runId`
9. Click **"Execute"**
10. **Expected:** Full run summary returned

---

## Running Automated E2E Tests

The project includes Playwright E2E tests that validate the full pipeline with mock services.

```bash
cd BAIA
npm run test:e2e
```

The E2E tests:
- Start a mock CMS server (port 4001)
- Start a mock Confluence server (port 4002)
- Start the E2E NestJS server (port 3001) with mock LLM and pipeline enabled
- Run through: Input → POST /api/runs → SSE progress → Review → Export

Test file: `e2e/tests/baia-pipeline.spec.ts`

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| Backend won't start | Port 3000 in use | `PORT=3001 npm run start:dev` or kill the process |
| Frontend shows blank page | Backend not running | Start backend in another terminal |
| API calls fail with CORS | CORS_ORIGIN mismatch | Ensure `.env` has `CORS_ORIGIN=http://localhost:4200` |
| Stale builds | Outdated compiled files | Run `npm run build` from root |
| Node version errors | Wrong Node.js version | Use Node 18+ |
| Form submit does nothing | Check browser console | Look for API errors or proxy issues |

---

## Test Results Log Template

Use this template to record test results:

```
Date: _______________
Tester: _____________
Environment: Windows / macOS / Linux
Browser: Chrome _____ / Firefox _____ / Edge _____

| Test # | Description                    | Pass/Fail | Notes |
|--------|--------------------------------|-----------|-------|
| 1      | Health Check                   |           |       |
| 2      | Create Run (API)               |           |       |
| 3a     | Missing fields validation      |           |       |
| 3b     | Empty targetUrl                |           |       |
| 3c     | Invalid URL format             |           |       |
| 3d     | Invalid repoProvider           |           |       |
| 3e     | All optional fields            |           |       |
| 4      | Run not found                  |           |       |
| 5      | Swagger docs                   |           |       |
| 6a-f   | Full UI flow                   |           |       |
| 7a-d   | UI form validation             |           |       |
| 8      | SSE stream                     |           |       |
| 9      | Export API error states        |           |       |
| 10a-b  | Export UI layout               |           |       |
| 11     | List all runs                  |           |       |
| 12     | Approve button                 |           |       |
| 13a-c  | DevTools inspection            |           |       |
| 14a-g  | Error & edge cases             |           |       |
| 15     | Swagger UI interactive         |           |       |
```
