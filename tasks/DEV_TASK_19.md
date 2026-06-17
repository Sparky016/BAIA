# DEV_TASK_19 — S3-05: Gherkin generator

**Section:** S3 — Phase 1: Exploratory Analyst
**Model tier:** O → Opus 4.8, high effort
**Size:** M
**Depends on:** DEV_TASK_13, DEV_TASK_18
**PRD ref:** §4.1 Gherkin Generation, §5 Gherkin Export story

## Goal
Translate the observed trace into valid Gherkin (`Feature/Scenario/Given/When/Then`) and validate the syntax.

## Files to create / edit
- `baia-server/src/gherkin/gherkin-generator.service.ts` — trace → `GherkinDoc` (baia-shared) via the `gherkin-generation` prompt; steps tagged `provenance: 'ui'`.
- `baia-server/src/gherkin/gherkin-validator.ts` — validate BDD structure; reject malformed output.

## Acceptance criteria
- Golden-file tests: sample trace → expected Gherkin.
- Validator **rejects malformed** Gherkin; generator retries on invalid LLM output.
- `LlmService` mocked. **≥90% lines** (core-logic module).
- Global gates (PLAN.md §A7).

## Out of scope
Merging code rules (S5).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
