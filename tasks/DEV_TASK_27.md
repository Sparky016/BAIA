# DEV_TASK_27 — S5-02: Unified document model

**Section:** S5 — Reconciliation & Merge
**Model tier:** S → Sonnet 4.6, medium effort
**Size:** S
**Depends on:** DEV_TASK_26, DEV_TASK_2
**PRD ref:** §4.2 (unified, enriched document), §4.3

## Goal
A serialisable unified document aggregate the UI renders and the exporter consumes, preserving per-step provenance.

## Files to create / edit
- `baia-shared/src/models/unified-doc.ts` — `GherkinDoc` aggregate: features → scenarios → steps with `provenance` + optional `ruleRefs`; conflicts list.
- `baia-server/src/reconcile/unified-doc.mapper.ts` — build/serialise/deserialise.

## Acceptance criteria
- Tests: serialise → deserialise round-trip equality; provenance + ruleRefs preserved.
- Global gates (PLAN.md §A7).

## Out of scope
Confluence rendering (DEV_TASK_30).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
