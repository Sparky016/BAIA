# Task 6 (P1): Translate Internal/LLM/Credential Errors into Actionable User Messages

## Problem

Several failure paths surface internal, technically-accurate-but-unhelpful text directly to the user, rather than a message that tells them what happened and what to do about it:

1. **`explore.orchestrator.ts:133`** — on any Phase 1 failure, the emitted event message is `Phase 1 failed: ${message}` where `message` is whatever the underlying error says verbatim — this could be an LLM provider's raw error text, a Playwright timeout stack fragment, etc.
2. **Confluence export failures** (`export/confluence.adapter.ts`) — e.g. a missing credential surfaces as `"No credential stored for ref='...'"`, which is accurate for a developer but meaningless to a reviewer trying to export documentation; a genuine Confluence outage (5xx) isn't distinguished from "page not found" (404) in `findPage()`, so a transient outage and a real "wrong space key" mistake get the same treatment.
3. **Credential decryption failures** (`security/credential-store.service.ts`) — "not found" and "tampered/wrong encryption key" return the identical generic message, so an operator who rotated `CREDENTIAL_ENCRYPTION_KEY` and now sees every credential fail has no way to tell that's what happened versus simply never having stored the credential.
4. **LLM adapters already have the right foundation and just aren't being leveraged for user messaging**: `LlmError` carries structured `code` values (`TIMEOUT`, `RATE_LIMITED`, `SCHEMA_VALIDATION`, `PROVIDER_ERROR`, `CONTENT_FILTERED`, `INVALID_INPUT`) — these should drive a friendly-message lookup instead of being stringified as-is into user-facing event text.
5. **Copilot LLM adapter throws during DI instantiation** if `COPILOT_TOKEN` is malformed (`copilot-llm.adapter.ts:333-360`), which crashes the *entire server* at boot rather than degrading gracefully to another configured mode — a misconfigured optional feature shouldn't take down the app.

## Implementation Notes

1. **Add a small "friendly error message" mapping layer**, e.g. `baia-server/src/common/user-facing-error.ts`, with a function like `toUserMessage(err: unknown): string` that pattern-matches on known error types/codes (`LlmError.code`, `ConfluenceAdapterError.code`, `CredentialStoreError.code`, `GherkinValidationError`) and returns a short, actionable sentence per case, e.g.:
   - `LlmError('TIMEOUT')` → "The AI took too long to respond. This can happen with complex pages — try again or simplify the instructions."
   - `LlmError('RATE_LIMITED')` → "The AI provider is rate-limiting requests right now. Wait a moment and retry."
   - `CredentialStoreError('NOT_FOUND')` → "No credentials found for that reference. Check the credentials reference you entered."
   - `CredentialStoreError('DECRYPTION_FAILED')` → "Stored credentials could not be read — they may have been created with a different encryption key. Re-enter your credentials."
   - `ConfluenceAdapterError` (5xx) → "Confluence appears to be unavailable right now. Try again shortly." vs. (404 on space/page) → "The Confluence space or page could not be found — check the Space Key."
   Fall back to a generic "Something unexpected happened during <phase>. Check server logs for details." for anything unrecognized, so unknown errors never leak raw internals to the browser.
2. **Wire this into every point that currently interpolates `err.message`/`String(err)` directly into an emitted event or HTTP response** — the orchestrators' catch blocks (`explore`, `analyze`, `reconcile`), `export.controller.ts`, and the new global exception filter from Task 2 are the main call sites.
3. **Distinguish transient vs. permanent errors in `ConfluenceAdapter.findPage()`** — a `404` on `findPage` (page genuinely doesn't exist yet, expected/normal) must not be conflated with a `5xx`/network failure (genuinely broken); only the latter should produce an error, the former should proceed to "create new page" as presumably intended.
4. **Make the Copilot config validation a non-fatal, per-adapter concern** — catch the misconfiguration at the point the adapter is selected (already-existing provider-selection logic described in README's "Provider Selection Logic") and fall back to the next configured mode (BYOK → Mock) with a clear startup log warning, rather than throwing out of DI construction and crashing the whole app.
5. Keep the underlying technical detail available server-side (log it in full) — this task is about what's shown to the user, not about removing diagnostic information for developers.

## Acceptance Criteria

- [x] A centralized `toUserMessage()` (or equivalent) maps known structured error types/codes to short, actionable, non-technical messages.
- [x] Phase failure events, export failures, and the global exception filter all use this mapping instead of raw `err.message`/`String(err)`.
- [x] `ConfluenceAdapter.findPage()` distinguishes "not found, proceed to create" from "unreachable/error, abort" and only the latter surfaces as a failure.
- [x] Credential "not found" vs. "decryption failed" produce distinguishable messages.
- [x] A malformed `COPILOT_TOKEN` no longer crashes server boot; it logs a warning and falls back per the existing provider-selection order.
- [x] New tests assert the friendly-message mapping for at least: LLM timeout, LLM rate-limit, missing credential, decryption failure, Confluence 404 vs 5xx.

## Affected Files

- New: `baia-server/src/common/user-facing-error.ts` (or similar)
- `baia-server/src/explore/explore.orchestrator.ts`, `code-analyst/analyze.orchestrator.ts`, `reconcile/reconcile.orchestrator.ts`
- `baia-server/src/export/confluence.adapter.ts`, `baia-server/src/export/export.controller.ts`
- `baia-server/src/security/credential-store.service.ts`
- `baia-server/src/llm/copilot-llm.adapter.ts` (and wherever provider selection happens, likely `llm/llm.module.ts` or `config/`)
