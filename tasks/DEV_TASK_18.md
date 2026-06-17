# DEV_TASK_18 — S3-04: Crawl & capture

**Section:** S3 — Phase 1: Exploratory Analyst
**Model tier:** S+ → Sonnet 4.6, high effort
**Size:** M
**Depends on:** DEV_TASK_16
**PRD ref:** §4.1 (capture DOM, network responses, application states)

## Goal
Record a structured trace of each step — DOM snapshot, network responses, page-state transition — and emit SSE progress, with secret redaction.

## Files to create / edit
- `baia-server/src/explore/crawl-capture.service.ts` — per-step capture into an ordered `ExploreTrace`; subscribe to Playwright network events; emit `ExploreEvent` into the runs event bus (DEV_TASK_9).
- Reuse the redaction helper (DEV_TASK_29) — until it lands, a local redactor with a TODO link.

## Acceptance criteria
- Tests assert trace shape + ordering and that **secrets/credentials are redacted** in captured DOM/network.
- Emits a progress event per step.
- Global gates (PLAN.md §A7).

## Out of scope
Planning loop (DEV_TASK_17); Gherkin (DEV_TASK_19).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
