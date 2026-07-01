# BAIA Review Plan

Generated from [`CODE_REVIEW.md`](./CODE_REVIEW.md). Each row is one unit of work; see the linked `REVIEW_TASK_N.md` for full detail (affected files, acceptance criteria, implementation notes).

| # | Task | Priority | Focus Area | Findings Addressed | File |
|---|------|----------|------------|---------------------|------|
| 1 | Implement the missing `OutputWriterService` / `OutputModule` | **P0** | Output recording | A1, A2 | [REVIEW_TASK_1.md](./REVIEW_TASK_1.md) |
| 2 | Guarantee every pipeline failure reaches a terminal state + user-visible error | **P0** | Guards | C1, C2 | [REVIEW_TASK_2.md](./REVIEW_TASK_2.md) |
| 3 | Harden the explore loop for reliable, efficient journey completion | **P1** | Journey efficiency | B1, B2, B3, B4, B5, B6 | [REVIEW_TASK_3.md](./REVIEW_TASK_3.md) |
| 4 | SSE reliability: heartbeat, stall detection, reconnect, cancel | **P1** | Guards + UI | C3, C4, D6 | [REVIEW_TASK_4.md](./REVIEW_TASK_4.md) |
| 5 | Extend redaction coverage to all persisted artifacts | **P1** | Output recording / Security | A4 | [REVIEW_TASK_5.md](./REVIEW_TASK_5.md) |
| 6 | Translate internal/LLM/credential errors into actionable user messages | **P1** | Guards | C5, C6, C7 | [REVIEW_TASK_6.md](./REVIEW_TASK_6.md) |
| 7 | Make the UI self-explanatory (legend, copy, styling, breadcrumb) | **P1** | UI friendliness | D1, D2, D3, D4, D5, D7 | [REVIEW_TASK_7.md](./REVIEW_TASK_7.md) |
| 8 | Output artifact durability (awaited/error-handled I/O, atomic writes, retention) | **P2** | Output recording | A3, A5, A6 | [REVIEW_TASK_8.md](./REVIEW_TASK_8.md) |
| 9 | Accessibility & remaining UX polish | **P2** | UI friendliness | D8, D9, B7 | [REVIEW_TASK_9.md](./REVIEW_TASK_9.md) |
| 10 | Close error-path test coverage gaps & repo hygiene cleanup | **P2** | Testing / Hygiene | B8, misc. | [REVIEW_TASK_10.md](./REVIEW_TASK_10.md) |

## Suggested Execution Order

Tasks 1 and 2 are blocking: the application cannot be built, started, or manually tested (per `MANUAL_TEST_GUIDE.md` Phase 1) until Task 1 lands, and no other reliability work can be verified without it. Task 2 should land immediately after so that all subsequent work is developed against a system that fails safely and visibly.

Tasks 3–7 (P1) directly address the four stated review concerns and can proceed in parallel once 1–2 are done, as they touch mostly disjoint files (explore module vs. SSE/frontend vs. output/security vs. error messages vs. UI templates).

Tasks 8–10 (P2) are durability/polish/hygiene follow-ups that should land after the P1 work stabilizes the core flows they build on.
