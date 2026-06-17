# DEV_TASK_12 — S2-02: `CopilotLlmAdapter`

**Section:** S2 — LLM Integration Layer (GitHub Copilot SDK)
**Model tier:** S+ → Sonnet 4.6, high effort
**Size:** M
**Depends on:** DEV_TASK_11
**PRD ref:** §3 AI/LLM Core

## Goal
Implement `LlmService` over the **GitHub Copilot SDK** — the ONLY file in the codebase that imports the SDK.

## Files to create / edit
- `baia-server/src/llm/copilot-llm.adapter.ts` — implements `LlmService`; auth/config from env (`COPILOT_*`); maps `complete`/`completeJson`/`countTokens`/`stream` to SDK calls; retry with backoff; error mapping to the interface's error contract.
- Bind adapter to `LLM_SERVICE` for non-test environments; mock for tests.

## Acceptance criteria
- **GitHub Copilot SDK fully mocked** in unit tests — no live network calls.
- Tests cover: auth/config init, successful completion, JSON-mode validation, retry-then-success, retry-exhausted error, malformed-response error.
- Global gates (PLAN.md §A7).

## Out of scope
Prompt content (DEV_TASK_13); chunking (DEV_TASK_14).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
