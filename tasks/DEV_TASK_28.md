# DEV_TASK_28 — S5-03: Wire reconcile into runs

**Section:** S5 — Reconciliation & Merge
**Model tier:** S → Sonnet 4.6, medium effort
**Size:** S
**Depends on:** DEV_TASK_7, DEV_TASK_26
**PRD ref:** §2, §4.3 (review)

## Goal
Orchestrate the `reconciling` state and transition the run into `review` with a unified doc attached.

## Files to create / edit
- `baia-server/src/reconcile/reconcile.orchestrator.ts` — take stored Gherkin + rules, reconcile, store unified doc, transition `reconciling→review`; emit progress; on error → `failed`.

## Acceptance criteria
- Integration test runs the full pipeline tail (mocks) and reaches `review` with a unified doc.
- Failure path → `failed` + event.
- Global gates (PLAN.md §A7).

## Out of scope
Export (S6); UI (S7/S8).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
