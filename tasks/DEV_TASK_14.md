# DEV_TASK_14 — S2-04: Token/chunk utilities
**Status:** ✅ Complete

**Section:** S2 — LLM Integration Layer (GitHub Copilot SDK)
**Model tier:** O → Opus 4.8, high effort
**Size:** M
**Depends on:** DEV_TASK_11
**PRD ref:** §6.3 (chunk code for context window optimization)

## Goal
Token counting + context-window chunking with overlap, so large code files and DOM snapshots fit the model window without losing boundary context.

## Files to create / edit
- `baia-server/src/llm/chunking.ts` — `chunk(text, { maxTokens, overlap, boundary })` returning ordered chunks with metadata (index, tokenCount, sourceRange); prefer semantic boundaries (lines/functions) when provided.
- Use `LlmService.countTokens`.

## Acceptance criteria
- Tests: empty input, input smaller than window, input requiring N chunks, overlap correctness, boundary preference, deterministic ordering. **≥90% lines** (core-logic module).
- No chunk exceeds `maxTokens`.
- Global gates (PLAN.md §A7).

## Out of scope
Repo walking (DEV_TASK_23).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
