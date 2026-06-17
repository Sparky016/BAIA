# DEV_TASK_26 — S5-01: Reconciliation engine

**Section:** S5 — Reconciliation & Merge
**Model tier:** O → Opus 4.8, high effort
**Size:** L
**Depends on:** DEV_TASK_19, DEV_TASK_24
**PRD ref:** §4.2 Reconciliation & Merge, §5 Reconciliation story

## Goal
Cross-reference Phase-1 Gherkin with Phase-2 rules; enrich UI steps with backend rules; flag conflicts and gaps.

## Files to create / edit
- `baia-server/src/reconcile/reconciliation.service.ts` — input `GherkinDoc` + `BusinessRule[]`; uses `reconciliation` prompt + deterministic matching; output enriched `GherkinDoc` with steps tagged `provenance: 'merged'|'code'` and conflict annotations.

## Acceptance criteria
- `LlmService` mocked. Fixtures cover: rule matches a step (enrich), conflict (flagged), code-only rule (added), ui-only step (kept). **≥90% lines** (core-logic module).
- Global gates (PLAN.md §A7).

## Out of scope
Doc serialisation (DEV_TASK_27); export (S6).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
