# DEV_TASK_11 — S2-01: `LlmService` interface + DI
**Status:** ✅ Complete

**Section:** S2 — LLM Integration Layer (GitHub Copilot SDK)
**Model tier:** O → Opus 4.8, high effort
**Size:** S
**Depends on:** DEV_TASK_6
**PRD ref:** §3 AI/LLM Core

## Goal
Define the provider-agnostic LLM contract every BAIA feature depends on, so the Copilot SDK stays swappable and all LLM-consuming code is mockable.

## Files to create / edit
- `baia-server/src/llm/llm.service.ts` — interface:
  - `complete(prompt, opts): Promise<string>`
  - `completeJson<T>(prompt, schema, opts): Promise<T>` (validated structured output)
  - `countTokens(text): number`
  - optional `stream(prompt, opts): AsyncIterable<string>`
- `baia-server/src/llm/llm.module.ts` — Nest DI token `LLM_SERVICE`.
- `baia-server/src/llm/mock-llm.service.ts` — deterministic mock impl for tests/E2E.

## Acceptance criteria
- Interface documented (JSDoc) with error contract.
- Mock impl provided + tested (deterministic outputs, JSON validation path).
- Global gates (PLAN.md §A7).

## Out of scope
Real SDK calls (DEV_TASK_12).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
