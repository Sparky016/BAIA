# Task 3 (P1): Harden the Explore Loop for Reliable, Efficient Journey Completion

## Problem

This task addresses reviewer concern #1 directly: "the explorer doesn't complete a journey efficiently and effectively." Six specific, verified issues in `baia-server/src/explore/`:

1. **Hard, silent step ceiling.** `explore.orchestrator.ts` hard-codes `const MAX_STEPS = 20;` inline (not configurable via env/config) with no distinction in the emitted `complete` event between "goal reached" and "step budget exhausted." A legitimate multi-step journey (e.g. a checkout wizard) that needs 25 steps is truncated and reported the same way as a success, producing an incomplete Gherkin doc with no signal to the user that it's incomplete.
2. **No phase-level timeout.** There's no wall-clock budget on Phase 1 as a whole — only the step count bounds it, and if each step takes tens of seconds (slow LLM/slow target site) the phase can run unbounded time.
3. **Weak repeat-state detection.** `exit-gate.service.ts`'s "repeated result" check compares the **human-readable `observation` string** across the last 3 steps (`a.observation === b.observation`), not a structural signal like URL + DOM hash. Minor wording variance from the executor/LLM causes false negatives (real loops go undetected); coincidental wording matches on different states cause false positives.
4. **DOM-text-only 404 detection.** The 404 exit gate looks for the literal substrings "404" plus "not found"/"page not found"/"does not exist" in the DOM text, ignoring the actual HTTP status code Playwright already has available from the navigation response. Custom error pages are missed; content that happens to mention "404" false-positives.
5. **No retry on transient action failures.** `action-executor.service.ts` never retries a failed click/fill/navigate — it returns `{ ok: false, ... }` once and the orchestrator immediately moves on to planning a new step. A single transient failure (slow-loading element, animation delay) causes the planner to abandon what may have been a necessary action rather than retrying it.
6. **No action deduplication/backoff.** `action-planner.service.ts` gives the LLM only prose descriptions of prior actions (no structured history), so it can replan the exact same failing action repeatedly. The repeated-failure exit gate only fires on **3 consecutive** failures — an alternating fail/succeed/fail pattern never trips it, silently burning the step budget.

## Implementation Notes

1. **Step budget transparency:**
   - Move `MAX_STEPS` to `ConfigService` (env-configurable, e.g. `EXPLORE_MAX_STEPS`, default 20).
   - When the loop exits because `step === MAX_STEPS - 1` rather than `goalReached`, emit a distinct event, e.g. `emitExploreEvent(runId, 'observation', 'Step budget exhausted before goal was reached', { exitReason: 'max_steps' })`, and consider flagging the generated `GherkinDoc` (or the `RunSummary`) with an `incomplete: true`/`truncated: true` marker so the Review page (Task 7) can surface a warning banner instead of presenting a truncated journey as a clean success.
2. **Phase timeout:** wrap the step loop with an overall deadline (e.g. `EXPLORE_PHASE_TIMEOUT_MS`, default e.g. 10 minutes) checked at the top of each iteration; on expiry, behave like a `max_steps` exit (clean teardown + distinct event), not a hard failure.
3. **Structural repeat detection:** change `exit-gate.service.ts`'s repeat check to hash `{ url, domSnapshot }` (or at minimum `url` + a normalized/truncated DOM fingerprint already captured by `CrawlCaptureService`) instead of comparing `observation` strings. Keep the 3-in-a-row window but make the equality check structural.
4. **HTTP-status-aware 404 detection:** thread the navigation response status (available from Playwright's `page.on('response')`/`goto()` result, already partially captured in `CrawlCaptureService`) into the exit gate's decision, checking `status === 404` in addition to (not instead of) the existing DOM-text heuristic, since some frameworks return 200 with a client-rendered "not found" page.
5. **Retry on transient failures:** in `action-executor.service.ts`, add a bounded retry (e.g. 1 retry with a short backoff, or a longer timeout on the second attempt) specifically for timeout-classified failures (element-not-found/navigation-timeout), before returning `ok:false` to the orchestrator. Keep genuinely non-retryable failures (invalid selector syntax) failing fast.
6. **Structured action history + alternating-failure detection:** pass a structured list of `{action, ok}` (not just prose) to the planner so a future improvement could dedupe identical repeated actions; at minimum, extend `exit-gate.service.ts` to also exit on "N failures within the last M steps" (a ratio/window check) rather than requiring an unbroken streak, so an alternating fail/succeed pattern still gets caught within a reasonable number of steps.
7. **Test coverage to add** (currently missing per test review): hitting `MAX_STEPS` before goal reached; a contradictory planner result (`action: null` with `goalReached: false`); HTTP-status-based 404 without matching DOM text; retried action succeeding on second attempt; alternating fail/succeed pattern triggering the new windowed-failure exit gate.

## Acceptance Criteria

- [x] `MAX_STEPS` is configurable and its exhaustion emits a distinct, clearly-labeled event and marks the run/document as incomplete.
- [x] Phase 1 has an enforced wall-clock timeout with a distinct exit event.
- [x] Repeat-state detection is based on a structural comparison (URL + DOM fingerprint), not free-text `observation` equality.
- [x] 404 detection considers HTTP status code in addition to DOM text.
- [x] At least one class of transient action failure is retried before being reported as a hard failure.
- [x] An alternating fail/succeed pattern is detected and exits the loop within a bounded number of steps instead of running to `MAX_STEPS`.
- [x] New unit tests cover each of the six scenarios listed above.

## Affected Files

- `baia-server/src/explore/explore.orchestrator.ts`
- `baia-server/src/explore/exit-gate.service.ts`
- `baia-server/src/explore/action-executor.service.ts`
- `baia-server/src/explore/action-planner.service.ts`
- `baia-server/src/explore/crawl-capture.service.ts` (surface HTTP status / DOM fingerprint if not already available)
- `baia-server/src/config/config.service.ts` (new config keys)
