# Task 5 (P1): Extend Redaction Coverage to All Persisted Artifacts

## Problem

`redactString()` (`baia-server/src/security/redaction.ts`) already exists and is correctly applied to DOM snapshots and network response bodies in `crawl-capture.service.ts:48,82,90`. This is good, but coverage is incomplete relative to everything that ends up persisted to `output/` (once Task 1 lands) and potentially exported to Confluence/OKF:

1. **Business rule extraction (`code-analyst/`) does not redact.** Business rules are extracted from the *target repository's own source code* (`rule-extractor.service.ts` → `saveBusinessRules`), which can legitimately contain secrets accidentally committed by the target repo's owners (hardcoded API keys, connection strings, `.env` files checked in by mistake). None of this passes through `redactString()` before being stored or later exported.
2. **Event log does not redact.** `runs.events.ts:74` (`appendEvent`) persists every event's `message`/`details` verbatim. These can include raw LLM/HTTP error text (e.g. a Confluence/GitHub API error echoing back a token in a URL, or an LLM provider error containing request metadata).
3. **Screenshots are fundamentally unredactable by string matching.** They are raw PNG buffers (`ScreenshotResult.data: Buffer`) capturing whatever is visually rendered — passwords typed into unmasked fields, real PII on a form, a payment page, etc. `redactString()` cannot help here; this needs either (a) a documented limitation and operational guidance (don't point BAIA at pages with live sensitive data, or use a test/staging environment), or (b) a best-effort mitigation such as instructing Playwright to mask known-sensitive input types before capture (e.g. `page.locator('input[type=password]')` styling override, or Playwright's screenshot `mask` option) — a full fix here is a larger effort and should be scoped explicitly rather than silently assumed to be "handled" by the existing DOM redaction.

## Implementation Notes

1. **Business rules:** apply `redactString()` to each `BusinessRule.statement` (and any `sourceFile`/snippet fields that might carry inline code fragments) before calling `runsService.storeBusinessRules` / `outputWriter.saveBusinessRules` in `analyze.orchestrator.ts`. Confirm the exact `BusinessRule` shape in `baia-shared/src/models/BusinessRule.ts` to know which fields carry free text vs. structured metadata.
2. **Event log:** apply `redactString()` to `event.message` and to string values within `event.details` before persisting in `appendEvent` — do this at the `OutputWriterService` boundary (Task 1) rather than at every emit call site, so it's applied once, consistently, regardless of which orchestrator emitted the event. Do **not** redact the copy sent over SSE to the browser if that would remove information the user needs to see live — redact only what's written to disk, or apply the same redaction to both if the live event could itself leak a secret (recommended: redact both, since a leaked token in a live UI log is just as bad as one on disk).
3. **Screenshots:** at minimum, add a note to `PlaywrightRunnerService`/`README.md` documenting that screenshots are not content-redacted and should not be run against pages containing live sensitive data. As a stronger mitigation, investigate Playwright's `page.screenshot({ mask: [...] })` targeting common sensitive selectors (`input[type=password]`, `input[autocomplete=cc-number]`, etc.) — scope this as a stretch goal within the task, not a blocker for the redaction work on rules/events.
4. **Regression check:** confirm `redactString()`'s existing pattern list (GitHub PATs, bearer/JWT tokens, API keys, passwords, URL userinfo — per the earlier code-analyst summary of `security/redaction.ts`) already covers the shapes of secrets likely to appear in source code and error messages; extend the pattern list if gaps are found (e.g. AWS-style keys, generic `.env`-style `KEY=value` lines) while doing this work.

## Acceptance Criteria

- [x] `BusinessRule` statements/snippets are passed through `redactString()` before being stored and before being written to `output/`.
- [x] Event `message`/`details` are redacted before being persisted to the event log (and, if adopted per the note above, before being sent over SSE).
- [x] A documented limitation exists (README or code comment) describing that screenshots are not content-redacted, with guidance for safe usage.
- [x] New tests confirm a rule/event containing a fake secret pattern (e.g. `ghp_xxx...`) is redacted in the persisted output.

## Affected Files

- `baia-server/src/code-analyst/analyze.orchestrator.ts`, `baia-server/src/code-analyst/rule-extractor.service.ts`
- `baia-server/src/runs/runs.events.ts` (or the new `OutputWriterService` from Task 1, if redaction is centralized there)
- `baia-server/src/security/redaction.ts` (extend patterns if gaps found)
- `README.md` / `baia-server/src/explore/playwright-runner.service.ts` (documentation of the screenshot limitation)
