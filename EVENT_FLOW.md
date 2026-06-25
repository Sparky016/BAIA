# BAIA — Event Flow Diagram

## User Journey: Dashboard → Completed Documentation

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                           USER JOURNEY FLOW                                 ║
╚══════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────┐
│  ROUTE: /input   (InputComponent)                                           │
│                                                                             │
│  User fills in:                                                             │
│    ┌──────────────────────┐  ┌──────────────────────────────────────────┐   │
│    │ Target URL (required) │  │ Instructions (natural language, required) │   │
│    └──────────────────────┘  └──────────────────────────────────────────┘   │
│    ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────────┐      │
│    │ Repo URL    │  │ Provider     │  │ Credentials Ref (optional)   │      │
│    │ (optional)  │  │ github/azure │  │                              │      │
│    └─────────────┘  └──────────────┘  └──────────────────────────────┘      │
│                                                                             │
│  [Start BAIA] ──clicked──▶  POST /api/runs  { targetUrl, instructions,     │
│                              repoUrl?, repoProvider?, credentialsRef? }     │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ Response: RunSummary { runId, status: queued }
                                     ▼
                        ┌────────────────────────┐
                        │  RunsService.createRun │
                        │  status = "queued"     │
                        │  persists run in Map   │
                        └────────────┬───────────┘
                                     │
                    navigate to /progress/:id
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ROUTE: /progress/:id   (ProgressComponent)                                 │
│                                                                             │
│  On init:                                                                   │
│    1. GET /api/runs/:id  → loads RunSummary into RunStore                   │
│    2. If status == "queued" →  POST /api/runs/:id/start { instructions }   │
│    3. GET /api/runs/:id/events  (SSE stream — text/event-stream)           │
│                                                                             │
│  UI shows:                                                                  │
│    ● Exploring   [████░░░░░░]                                               │
│    ● Analyzing   [░░░░░░░░░░]                                               │
│    ● Reconciling [░░░░░░░░░░]                                               │
│    ● Review      [░░░░░░░░░░]                                               │
│    + Event log (action descriptions, embedded screenshots)                  │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │ 202 Accepted — pipeline runs async
                                     ▼
╔═════════════════════════════════════════════════════════════════════════════╗
║  BACKEND: PipelineService.runFullPipeline()                                 ║
║  RunStateMachine enforces: queued→exploring→analyzing→reconciling→review    ║
╚═════════════════════════════════════════════════════════════════════════════╝

 ┌──────────────────────────────────────────────────────────────────────────┐
 │  PHASE 1 — EXPLORE          state: queued ──▶ exploring                  │
 │                                                                          │
 │  ExploreOrchestrator.executePhase1()                                     │
 │                                                                          │
 │  PlaywrightRunner.launch()                                               │
 │        │                                                                 │
 │        ▼                                                                 │
 │  [Loop: until instructions exhausted]                                    │
 │        │                                                                 │
 │        ├─▶ CrawlCaptureService.captureSnapshot()                         │
 │        │     └── captures DOM + screenshot                               │
 │        │                                                                 │
 │        ├─▶ ActionPlannerService (LLM call)                               │
 │        │     Input:  DOM snapshot, URL, instructions, prior actions      │
 │        │     Output: next Action {type: Click|Fill|Navigate|Assert…}     │
 │        │                                                                 │
 │        ├─▶ ActionExecutorService.execute(action)                         │
 │        │     └── Playwright performs the action on real browser          │
 │        │                                                                 │
 │        └─▶ Emit ExploreEvent {type:'action'|'screenshot', message, …}    │
 │              └── SSE pushes to frontend → UI event log + screenshot      │
 │                                                                          │
 │  GherkinGeneratorService.generate(trace)                                 │
 │        └── LLM call → GherkinDoc {features[].scenarios[].steps[]}       │
 │              all steps: provenance = 'ui'                                │
 │  Validate Gherkin (gherkin-validator.ts)                                 │
 │  RunsService.updateRun({ gherkinDoc })                                   │
 │  Emit ExploreEvent {type:'complete'}                                     │
 │  Transition: exploring ──▶ analyzing                                     │
 └──────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  PHASE 2 — ANALYZE          state: analyzing ──▶ reconciling             │
 │                                                                          │
 │  AnalyzeOrchestrator.executePhase2()                                     │
 │                                                                          │
 │  if no repoUrl provided:                                                 │
 │     └── skip directly → transition: analyzing ──▶ reconciling            │
 │                                                                          │
 │  if repoUrl provided:                                                    │
 │     ├─▶ GitHub/AzureConnector.authenticate(credentialsRef)               │
 │     ├─▶ IngestionService.clone(repoUrl) → code chunks                   │
 │     └─▶ RuleExtractorService.extract(chunks)                             │
 │              LLM call per chunk → BusinessRule[]                         │
 │              { category, statement, confidence, sourceFile, lineRange }  │
 │     RunsService.updateRun({ businessRules })                             │
 │     Transition: analyzing ──▶ reconciling                                │
 └──────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  PHASE 3 — RECONCILE        state: reconciling ──▶ review                │
 │                                                                          │
 │  ReconcileOrchestrator.executeReconcile()                                │
 │                                                                          │
 │  ReconciliationService (LLM call)                                        │
 │     Input:  GherkinDoc + BusinessRules[]                                 │
 │     Output: UnifiedDoc                                                   │
 │       ├── Steps matched to code rules   → provenance = 'merged'          │
 │       ├── Code rules with no UI step   → new scenario, provenance='code' │
 │       └── Contradictions detected      → conflicts[] with conflictNote   │
 │                                                                          │
 │  UnifiedDocMapper.map(reconciled) → UnifiedDoc                           │
 │  RunsService.updateRun({ unifiedDoc })                                   │
 │  Emit RunTransitionEvent { status: 'review' }   ◀── SSE to frontend      │
 │  Transition: reconciling ──▶ review                                      │
 └──────────────────────────────────────────────────────────────────────────┘
                                     │
              SSE event: status='review' received by ProgressComponent
                                     │
                    auto-navigate to /review/:id
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ROUTE: /review/:id   (ReviewComponent)                                     │
│                                                                             │
│  On init: GET /api/runs/:id → loads UnifiedDoc (or GherkinDoc) into store  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  GherkinEditorComponent                                             │   │
│  │                                                                     │   │
│  │  Renders scenarios with provenance colour-coding:                   │   │
│  │    'ui'     — observed from live browser                            │   │
│  │    'code'   — extracted from source code                            │   │
│  │    'merged' — validated by both                                     │   │
│  │    conflict — conflictNote shown as warning                         │   │
│  │                                                                     │   │
│  │  User edits: feature names, scenario names, step text               │   │
│  │  Changes → RunStore.gherkinDocEdited (client-side only)             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [Approve]  →  RunStore.approved = true  (enables export buttons)          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ExportPanelComponent                                               │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ Option A: Export to Confluence                              │   │   │
│  │  │   User enters: baseUrl, spaceKey, credentialsRef, pageId?  │   │   │
│  │  │   POST /api/runs/:id/export  { …confluenceParams }         │   │   │
│  │  │   Backend: ConfluenceAdapter → REST API → page created      │   │   │
│  │  │   Transition: review → exporting → done                    │   │   │
│  │  │   Response: { confluenceUrl }                              │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ Option B: Download .feature (Gherkin)                       │   │   │
│  │  │   GET /api/runs/:id/export/gherkin                          │   │   │
│  │  │   Backend: GherkinDoc → plain-text BDD format               │   │   │
│  │  │   Browser: downloads filename.feature                       │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ Option C: Download .zip (OKF bundle)                        │   │   │
│  │  │   GET /api/runs/:id/export/okf                              │   │   │
│  │  │   Backend: okf-generator → Gherkin + metadata zipped        │   │   │
│  │  │   Browser: downloads bundle.zip                             │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                    Confluence: status → done  ✓
                    Download:   stays at review (no state change)
```

---

## State Machine

```
  queued ──▶ exploring ──▶ analyzing ──▶ reconciling ──▶ review ──▶ exporting ──▶ done
    │             │              │              │            │
    └─────────────┴──────────────┴──────────────┴────────────┴──▶ failed
```

---

## SSE Event Flow (real-time updates)

```
Backend                                   Frontend (ProgressComponent)
────────────────────────────────────────────────────────────────────────
RunTransitionEvent { status:'exploring' }  ──▶ progress bar 1 active
ExploreEvent { type:'action', msg:'…' }    ──▶ event log entry appended
ExploreEvent { type:'screenshot', … }      ──▶ RunStore.latestScreenshot shown
ExploreEvent { type:'complete' }           ──▶ phase 1 bar fills
RunTransitionEvent { status:'analyzing' }  ──▶ progress bar 2 active
RunTransitionEvent { status:'reconciling'} ──▶ progress bar 3 active
RunTransitionEvent { status:'review' }     ──▶ auto-navigate to /review/:id
```

---

## API Endpoint Reference

| Endpoint                        | Method | Handler                        | Purpose                        |
|---------------------------------|--------|--------------------------------|--------------------------------|
| `/api/runs`                     | POST   | RunsController.createRun       | Create run (status: queued)    |
| `/api/runs`                     | GET    | RunsController.getAllRuns       | List all runs                  |
| `/api/runs/:id`                 | GET    | RunsController.getRun          | Get single run details         |
| `/api/runs/:id/start`           | POST   | StartController.startPipeline  | Kick off pipeline (202)        |
| `/api/runs/:id/events`          | GET    | RunsSseController.streamEvents | SSE progress stream            |
| `/api/runs/:id/export`          | POST   | ExportController.exportRun     | Publish to Confluence          |
| `/api/runs/:id/export/gherkin`  | GET    | ExportController.downloadGherkin | Download .feature file       |
| `/api/runs/:id/export/okf`      | GET    | ExportController.downloadOkf   | Download .zip bundle           |
| `/api/health`                   | GET    | HealthController               | Health check                   |

---

## Provenance Model

Every Gherkin step carries a `provenance` tag tracking its origin:

| Value      | Meaning                                              |
|------------|------------------------------------------------------|
| `'ui'`     | Observed during Phase 1 Playwright exploration       |
| `'code'`   | Extracted from Phase 2 source code analysis          |
| `'merged'` | UI step validated and enriched by a matching rule    |

Conflicts (UI behaviour contradicts code constraint) are stored in `UnifiedDoc.conflicts[]` with a `conflictNote` and surfaced as warnings in the review editor.

---

## Known Gaps

| # | Gap | Impact |
|---|-----|--------|
| 1 | User edits in `GherkinEditorComponent` write to `RunStore.gherkinDocEdited` (client-only); `POST /api/runs/:id/export` reads the server-stored doc, not the edited version | Edits may not appear in Confluence export |
| 2 | Approval (`RunStore.approved`) is enforced client-side only; no server-side guard on the export endpoint | Raw API calls bypass the approval gate |
