# DEV_TASK_13 — S2-03: Prompt template registry

**Section:** S2 — LLM Integration Layer (GitHub Copilot SDK)
**Model tier:** S → Sonnet 4.6, medium effort
**Size:** S
**Depends on:** DEV_TASK_11
**PRD ref:** §6.4 (LLM prompting & formatting)

## Goal
Centralise versioned, strictly-typed prompt templates for each BAIA LLM task with explicit output schemas.

## Files to create / edit
- `baia-server/src/llm/prompts/` — templates for: `action-planning`, `gherkin-generation`, `rule-extraction`, `reconciliation`.
- Each template: render function taking typed inputs → prompt string + a JSON output schema (for `completeJson`).
- Enforce Gherkin/BDD formatting rules in the gherkin template.

## Acceptance criteria
- Tests: render snapshot per template with sample inputs; output-schema validation accepts good / rejects bad payloads.
- Templates are versioned (id + version).
- Global gates (PLAN.md §A7).

## Out of scope
Calling the LLM (consumers do that in S3–S5).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
