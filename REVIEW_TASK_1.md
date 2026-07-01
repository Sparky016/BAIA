# Task 1 (P0): Implement the missing `OutputWriterService` / `OutputModule`

## Problem

`baia-server/src/output/` does not exist — never committed to git (`git log --all -- '*output-writer*'` returns nothing) — yet it is imported and wired into DI in 6 files and called at 7 distinct call sites across 4 modules. As it stands:

- `AppModule` imports `OutputModule` from `./output/output.module` (`app.module.ts:7,17`) — Nest will throw at bootstrap trying to resolve a module that doesn't exist. **The server cannot start.**
- Every spec file that provides a mock (`runs.service.spec.ts`, `runs.events.spec.ts`, `explore.orchestrator.spec.ts`, `analyze.orchestrator.spec.ts`, `reconcile.orchestrator.spec.ts`) imports the real class via `import { OutputWriterService } from '../output/output-writer.service'` purely to get a type for `jest.Mocked<Partial<...>>` — this import fails at module resolution under ts-jest, so **these test suites cannot run either.**
- This is the direct root cause of reviewer concern #2 ("behaviour is recorded and written to the output/ folder as the process progresses") — there is currently no implementation of that behavior at all.

## Required Interface

Reverse-engineered from every call site in the codebase (these are the exact methods and argument shapes other modules already depend on):

| Method | Called from | Purpose |
|---|---|---|
| `initRun(runId: string, summary: RunSummary): void` | `runs.service.ts:131` (`createRun`) | Create the run's output directory and write the initial run summary, at run creation (`queued` state). |
| `updateRunSummary(runId: string, patch: Partial<Pick<RunSummary,'status'|'updatedAt'>>): void` | `runs.service.ts:167` (`transitionRun`) | Persist the run summary's state transitions as they happen. |
| `appendEvent(runId: string, event: ExploreEvent): void` | `runs.events.ts:74` (`emit`) | Append every SSE event (action/observation/error/complete/screenshot) to a durable event log, in order, as it's emitted — this is the primary "journey" record. |
| `saveScreenshot(runId: string, step: number, url: string, data: Buffer): void` | `explore.orchestrator.ts:68` | Persist each step's full-page PNG screenshot as it's captured, keyed by step number and page URL. |
| `saveGherkinDoc(runId: string, doc: GherkinDoc): void` | `explore.orchestrator.ts:118` | Persist the generated Gherkin document at the end of Phase 1. |
| `saveBusinessRules(runId: string, rules: BusinessRule[]): void` | `analyze.orchestrator.ts:100` | Persist extracted business rules at the end of Phase 2. |
| `saveUnifiedDoc(runId: string, doc: UnifiedDoc): void` | `reconcile.orchestrator.ts:75` | Persist the reconciled unified document at the end of Phase 3. |

## Implementation Notes

1. **Location & wiring:** Create `baia-server/src/output/output-writer.service.ts` and `baia-server/src/output/output.module.ts` exactly matching the import paths already used everywhere (`../output/output-writer.service`). `OutputModule` should export `OutputWriterService` and be marked `@Global()` or explicitly imported by every module that currently references it (`RunsModule`, `PipelineModule` — check `explore`, `code-analyst`, `reconcile` are all reachable from `PipelineModule`'s providers).
2. **Directory layout** (suggested, adjust to match `output/` README description): `output/<runId>/summary.json`, `output/<runId>/events.ndjson` (newline-delimited JSON, append-friendly), `output/<runId>/screenshots/step-<NNN>.png`, `output/<runId>/gherkin.json`, `output/<runId>/business-rules.json`, `output/<runId>/unified-doc.json`.
3. **Directory creation:** `initRun` should create `output/<runId>/` (and `screenshots/`) via `fs.mkdir(..., { recursive: true })` before any other write for that run is attempted. Guard against a run directory already existing (idempotent).
4. **Async correctness:** Every method above should perform its own I/O internally and either (a) return `void` but internally `.catch()` and log any failure without throwing back into the caller's hot path (current call sites are all synchronous, unawaited calls — see Task 8 for making these safely awaited instead), or (b) be converted to `Promise<void>` and have all 7 call sites updated to `await` them and wrap in try/catch — **prefer option (b)**, since Task 8 requires this anyway and it's better to do it once, correctly, from the start rather than patch it in later.
5. **`runId` path safety:** Validate/sanitize `runId` before using it in a path (e.g. `/^run-\d{4,}$/` or a stricter allowlist) and throw a clear internal error if it doesn't match, rather than trusting it blindly in `path.join()`.
6. **Keep this task scoped to "make it exist and work correctly for the happy path."** Redaction (Task 5), retention/atomicity (Task 8), and new tests (Task 10) are intentionally separate tasks — don't scope-creep this one, but do leave the method signatures `Promise`-based so those follow-ups don't require another signature change.

## Acceptance Criteria

- [ ] `baia-server/src/output/output-writer.service.ts` and `output.module.ts` exist and export the 7 methods above with matching signatures.
- [ ] `npm run build` succeeds in `baia-server` (currently fails/cannot be verified because the module is missing).
- [ ] `npm run start:dev` boots the server without a Nest "cannot resolve dependency" error.
- [ ] All existing spec files that mock `OutputWriterService` (`runs.service.spec.ts`, `runs.events.spec.ts`, `explore.orchestrator.spec.ts`, `analyze.orchestrator.spec.ts`, `reconcile.orchestrator.spec.ts`) pass unchanged (their mocks already match the required interface above).
- [ ] Manually running the flow in `MANUAL_TEST_GUIDE.md` Phase 3–5 with Mock LLM produces a populated `output/<runId>/` directory with a summary, an event log, per-step screenshots, and the phase-end documents.
- [ ] `output/` remains git-ignored (already the case — `.gitignore:48`).

## Affected Files

- New: `baia-server/src/output/output-writer.service.ts`, `baia-server/src/output/output.module.ts`
- Verify wiring only (no logic change expected): `app.module.ts`, `runs/runs.module.ts`, `pipeline/pipeline.module.ts`, and any module providing `ExploreOrchestrator`/`AnalyzeOrchestrator`/`ReconcileOrchestrator`.
