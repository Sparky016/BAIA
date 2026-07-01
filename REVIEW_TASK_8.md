# Task 8 (P2): Output Artifact Durability (Awaited I/O, Atomic Writes, Retention)

## Problem

This task assumes Task 1 (implement `OutputWriterService`) has landed, and hardens it. Even a correct initial implementation has three durability gaps if not addressed at design time:

1. **Every current call site invokes `outputWriter.*` synchronously, unawaited, with no surrounding try/catch** (`explore.orchestrator.ts:68,118`, `runs.service.ts:131,167`, `runs.events.ts:74`, `analyze.orchestrator.ts:100`, `reconcile.orchestrator.ts:75`). If the Task 1 implementation performs real (async) file I/O and a write fails (disk full, permission denied, path issue), the failure is either an unhandled promise rejection (crashing the process or silently becoming an "unhandled rejection" log with no run-level consequence) or, if implemented defensively to swallow errors internally, an artifact silently never gets written with **no signal anywhere** that it happened — directly undermining "recorded as the process progresses" (reviewer concern #2), since a user reviewing `output/` after a run would have no way to know some steps are missing.
2. **No atomicity.** A naive `fs.writeFile()` on `summary.json`/`gherkin.json`/etc. can leave a half-written, corrupt JSON file if the process is killed mid-write (e.g. `SIGKILL`, OOM). Any tooling that later reads these files (a future dashboard, a manual `cat output/run-0001/summary.json` per the manual test workflow) could get unparseable output.
3. **No retention/cleanup policy.** Nothing bounds the number or size of run directories under `output/`; a long-lived server accumulates one full directory of screenshots per run forever, eventually exhausting disk — which, combined with problem #1, would then start silently dropping artifacts right when the system is under the most stress.

## Implementation Notes

1. **Await + error-handle all output writes.** Convert the 7 `OutputWriterService` methods to return `Promise<void>` (per the recommendation already made in Task 1) and update all 7 call sites to `await` them wrapped in a try/catch that logs the failure at `warn` level and — importantly — does **not** fail the run itself (an output-write failure shouldn't abort a working pipeline), but *does* get surfaced somewhere visible, e.g. accumulate a non-fatal warnings list on the `RunSummary` (`outputWriteWarnings?: string[]`) that the Review page can display ("Note: some run artifacts could not be saved to disk").
2. **Atomic writes for JSON documents** (`summary.json`, `gherkin.json`, `business-rules.json`, `unified-doc.json`): write to a temp file in the same directory (e.g. `summary.json.tmp-<random>`) then `fs.rename()` over the final path — rename is atomic on the same filesystem, guaranteeing readers never see a partial file. Screenshots (`step-NNN.png`) are single-shot writes of immutable data, so this matters less there but doesn't hurt. The append-only event log (`events.ndjson`) is naturally line-atomic if writes are flushed per line, but confirm the implementation flushes each `appendEvent` call fully before returning (no partial-line writes).
3. **Retention policy:** add a simple, configurable cleanup (e.g. `OUTPUT_RETENTION_DAYS` env var, default e.g. 30, plus optionally a max-directory-count cap) run on a schedule (a `@Cron`/simple `setInterval` in `OutputModule`, or a manual `npm run` maintenance script if scheduling infra doesn't already exist) that removes run directories older than the retention window. Log what was cleaned up. Keep this simple — this is a hygiene safeguard, not a full archival system.
4. **Path safety hardening:** validate `runId` against a strict pattern (e.g. `/^run-\d+$/`) inside `OutputWriterService` itself (defense in depth, even though the generator in `RunsService` is already safe) before it's used in any `path.join()` call, and reject/throw clearly if it doesn't match rather than silently writing to an unexpected location.

## Acceptance Criteria

- [ ] All `OutputWriterService` calls are awaited and wrapped in error handling that logs failures without aborting the run.
- [ ] A non-fatal output-write failure is visible somewhere in the UI (e.g. a warning banner on Review), not just in server logs.
- [ ] JSON document writes use a temp-file-then-rename pattern; a simulated crash mid-write (kill process between temp write and rename) never leaves a corrupt `summary.json`/`gherkin.json` etc.
- [ ] A configurable retention policy removes old run directories automatically, with the cleanup activity logged.
- [ ] `runId` is validated defensively inside `OutputWriterService` before use in any file path.
- [ ] New tests cover: a simulated write failure (e.g. mocked `fs` throwing `EACCES`) not crashing the pipeline; atomic rename behavior; retention cleanup removing only directories past the configured age.

## Affected Files

- `baia-server/src/output/output-writer.service.ts` (from Task 1)
- `baia-server/src/output/output.module.ts` (retention scheduling)
- `baia-server/src/config/config.service.ts` (new retention/env config)
- `baia-shared/src/models/RunSummary.ts` (optional `outputWriteWarnings` field, if adopted)
- `baia-ui/src/app/review/*` (surface warnings if adopted)
