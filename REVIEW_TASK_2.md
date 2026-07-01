# Task 2 (P0): Guarantee Every Pipeline Failure Reaches a Terminal State + User-Visible Error

## Problem

`explore.orchestrator.ts`, `analyze.orchestrator.ts`, and `reconcile.orchestrator.ts` each already do the right thing *within their own try block*: catch the error, emit an `error` `ExploreEvent`/analyze/reconcile event, call `runsService.transitionRun(runId, RunStatus.Failed)`, then rethrow. This is a solid, consistent pattern.

However, this safety net only covers errors thrown **inside** those try blocks. Two gaps remain:

1. **`baia-server/src/pipeline/start.controller.ts:72-77`** kicks off `pipelineService.runFullPipeline(...)` fire-and-forget and only does:
   ```ts
   this.pipelineService.runFullPipeline(...).catch((err) => {
     this.logger.error(`Pipeline error for run ${id}: ${msg}`);
   });
   ```
   If an error is thrown **before** an orchestrator's own try block starts (e.g. `PlaywrightRunnerService.launch()` fails synchronously before `explore.orchestrator.ts`'s try, or `RunsService.getRun()`/`transitionRun()` itself throws due to an illegal state), this catch only logs — it never forces the run to `failed` and never emits any event. The run is stuck in its current state forever, and the frontend's SSE stream (which is only closed on a terminal transition — see `runs.events.ts:21` `TERMINAL_STATUSES`) never closes or errors. **The user is left on the progress page indefinitely with no indication anything went wrong.**
2. **No global NestJS exception filter exists** (`main.ts` has no `app.useGlobalFilters(...)`). Any unhandled error in a synchronous controller path (not just the async pipeline) returns Nest's default bare `{"statusCode":500,"message":"Internal Server Error"}` with no structured error code or correlation to the run, and no consistency with how errors are represented elsewhere (e.g. `LlmError`, `ConfluenceAdapterError`, `CredentialStoreError` already use structured `code` fields — the global filter should normalize all of these into one response shape).

## Implementation Notes

1. **Add a last-resort safety net in `PipelineService.runFullPipeline`** (or wrap the call in `StartController`) that guarantees a terminal transition:
   ```ts
   try {
     await this.exploreOrchestrator.executePhase1(...);
     await this.analyzeOrchestrator.executePhase2(...);
     await this.reconcileOrchestrator.executeReconcile(...);
   } catch (err) {
     // Orchestrators already transition to Failed + emit an error event for
     // errors inside their own try blocks. This catch exists purely as a
     // backstop for errors that occur outside those blocks (e.g. thrown
     // before an orchestrator's try starts, or from RunsService itself).
     const run = this.runsService.tryGetRun(runId); // add a non-throwing lookup
     if (run && !isTerminalStatus(run.status)) {
       this.runsEvents.emit(runId, { type: 'error', message: ..., details: { error: String(err) } });
       this.runsService.transitionRun(runId, RunStatus.Failed);
     }
     throw err; // still let StartController log it
   }
   ```
   Add an `isTerminalStatus`/`TERMINAL_STATUSES` check (reuse the constant already defined in `runs.events.ts:21`, consider exporting it from `run-state-machine.ts` as the single source of truth) so this doesn't attempt an illegal transition if an orchestrator already handled it.
2. **Add a global exception filter** (`baia-server/src/common/http-exception.filter.ts` or similar), registered via `app.useGlobalFilters(new AllExceptionsFilter())` in `main.ts`. It should:
   - Map known structured errors (`LlmError`, `ConfluenceAdapterError`, `CredentialStoreError`, `GherkinValidationError`, `IllegalRunTransitionError`) to appropriate HTTP status codes with a consistent `{ statusCode, code, message }` body.
   - Fall back to a generic `500` with a safe, non-leaking message for anything unrecognized, while still logging the full error server-side.
3. **Test the gap explicitly:** add a test that makes `PlaywrightRunnerService.launch()` (or another pre-try-block dependency) throw, and assert the run ends up in `failed` with an emitted error event — this scenario is currently untested anywhere (`explore.orchestrator.spec.ts` only tests errors raised from within the try block).

## Acceptance Criteria

- [ ] A run whose failure originates outside an orchestrator's own try block still ends in `RunStatus.Failed` with an `error` event emitted and the SSE stream closed.
- [ ] A global exception filter is registered in `main.ts` and normalizes structured domain errors to consistent HTTP responses.
- [ ] New test(s) cover the "error thrown before orchestrator's try block" scenario for at least one phase.
- [ ] Manual test: kill the target Playwright browser process (or otherwise force a pre-try failure) mid-run and confirm the progress page shows a failure, not an infinite spinner.

## Affected Files

- `baia-server/src/pipeline/pipeline.service.ts`, `baia-server/src/pipeline/start.controller.ts`
- `baia-server/src/main.ts` (register global filter)
- New: `baia-server/src/common/all-exceptions.filter.ts` (or equivalent)
- `baia-server/src/runs/runs.service.ts` (add a non-throwing `tryGetRun`/`isTerminal` helper if not already present)
