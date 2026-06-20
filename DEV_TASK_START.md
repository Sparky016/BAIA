# DEV_TASK: Wire `/start` Endpoint to Main Server & Update UI

## Issue Summary

The BAIA pipeline machinery is fully functional and tested end-to-end, but **the production server (`main.ts`) does not expose the `/start` endpoint** needed to trigger pipeline execution. Only the E2E server (`e2e-server.ts`) has this endpoint.

Additionally, the Angular UI's progress page has **no mechanism to trigger the pipeline start**—it only listens for SSE events.

**Result:** A run stays in `queued` state indefinitely because nothing calls `POST /api/runs/:id/start`.

---

## What Works

✓ `POST /api/runs` — creates a queued run  
✓ `GET /api/runs/:id` — retrieves run state  
✓ `GET /api/runs/:id/events` — SSE stream for progress updates  
✓ Full pipeline (Explore → Analyze → Reconcile) executes when triggered  
✓ Export to Confluence works  
✓ Angular UI displays all pages correctly  

**Tested with:** `/voice` Playwright UI automation, navigating MyCMS URL, filling forms, approving docs, and exporting to Confluence. All stages completed successfully in e2e mode.

---

## What's Missing

### 1. Main Server (`baia-server/src/main.ts`)

**Currently:** No `/start` endpoint.

**Needed:** Add `E2eStartController` to the main `AppModule` so the endpoint is available in production.

**Files to modify:**
- `baia-server/src/app.module.ts` — import and register `E2eStartController` (or create a production-safe version)
- `baia-server/src/main.ts` — ensure required providers are registered

**Related files (already exist in e2e code):**
- `baia-server/src/e2e/e2e-start.controller.ts` — the endpoint handler
- `baia-server/src/e2e/e2e-pipeline.service.ts` — the orchestrator that chains phases

### 2. Angular UI (`baia-ui`)

**Currently:** Progress page only listens to SSE; no button or mechanism to start the pipeline.

**Needed:** Add a "Start Pipeline" button on the progress page, or automatically call `/start` when navigating to `/progress/:id` with a fresh run in `queued` state.

**Files to modify:**
- `baia-ui/src/app/progress/progress.component.ts` — add logic to trigger `/start`
- `baia-ui/src/app/progress/progress.component.html` — add UI button (optional if auto-start)
- `baia-ui/src/app/core/api/runs-api.service.ts` — add `startRun(runId, body)` method

---

## Implementation Notes

### Option A: Auto-start on Progress Page Load
When the progress component loads with a `queued` run, automatically call `POST /api/runs/:id/start` with the saved request body. Simple UX.

### Option B: Explicit "Start" Button
Display a button that the user clicks to start the pipeline. Gives user control but requires extra UI state.

### Option C: Hybrid
Auto-start, but show a loading indicator and let users cancel if needed.

---

## Test Plan

1. **Create a run via the UI** — should still land in `queued` state at `/progress/:id`.
2. **Verify `/start` is callable:**
   ```bash
   curl -X POST http://localhost:3000/api/runs/run-0001/start \
     -H "Content-Type: application/json" \
     -d '{
       "instructions": "...",
       "repoUrl": "https://github.com/...",
       "credentialsRef": "..."
     }'
   # Should return 202 with { accepted: true, runId: "run-0001" }
   ```
3. **Verify pipeline transitions** via SSE: `queued → exploring → analyzing → reconciling → review`.
4. **Full e2e flow:** Create → (auto or manual) Start → Progress → Review → Approve → Export.

---

## Acceptance Criteria

- [ ] `POST /api/runs/:id/start` is available on the main production server
- [ ] Angular progress page triggers pipeline start (auto or via button)
- [ ] SSE stream receives all phase transitions and auto-redirects to review on completion
- [ ] No changes to e2e server or existing passing pipeline logic
- [ ] Existing `/api/runs` contract unchanged

---

## Related Files

**Backend (NestJS):**
- `baia-server/src/app.module.ts` — main module
- `baia-server/src/runs/runs.controller.ts` — POST /runs (create)
- `baia-server/src/runs/runs.sse.controller.ts` — GET /runs/:id/events (SSE)
- `baia-server/src/e2e/e2e-start.controller.ts` — **THE `/start` ENDPOINT** (reference for production)
- `baia-server/src/e2e/e2e-pipeline.service.ts` — orchestrates the full pipeline

**Frontend (Angular):**
- `baia-ui/src/app/progress/progress.component.ts` — listens to SSE
- `baia-ui/src/app/input/input.component.ts` — creates runs
- `baia-ui/src/app/core/api/runs-api.service.ts` — API client
- `baia-ui/src/app/core/state/run.store.ts` — state management

**Mock Servers (E2E fixtures):**
- `e2e/helpers/mock-confluence-server.mjs` — Confluence REST API mock
- `e2e/helpers/mock-mycms-server.mjs` — MyCMS HTML mock
- `e2e/tests/baia-pipeline.spec.ts` — existing e2e tests

---

## References

- Tested via Playwright automation on 2026-06-19
- Full pipeline works end-to-end when `/start` is called manually
- All phase transitions, SSE events, and exports verified
