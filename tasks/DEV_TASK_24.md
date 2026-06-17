# DEV_TASK_24 — S4-04: Rule extraction

**Section:** S4 — Phase 2: Code Analyst
**Model tier:** O → Opus 4.8, high effort
**Size:** L
**Depends on:** DEV_TASK_13, DEV_TASK_23
**PRD ref:** §4.2 Codebase Analysis (constraints, calculations, validations)

## Goal
Extract categorised, source-referenced business rules from code chunks via the LLM.

## Files to create / edit
- `baia-server/src/code-analyst/rule-extractor.service.ts` — per chunk: `rule-extraction` prompt + `completeJson` → `BusinessRule[]` (baia-shared) with `category` (constraint/calculation/validation/other) and `sourceRef` (file + range); dedupe across chunks.

## Acceptance criteria
- `LlmService` mocked. Tests on `MyCMS` fixture chunks assert extracted rules carry category + sourceRef; dedupe works; malformed LLM output rejected/retried. **≥90% lines** (core-logic module).
- Global gates (PLAN.md §A7).

## Out of scope
Merging with UI Gherkin (S5).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
