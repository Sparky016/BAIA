# DEV_TASK_32 — S7-01: Routing + shell

**Section:** S7 — Frontend: Shell, Input, Progress
**Model tier:** H → Haiku 4.5, low effort
**Size:** S
**Depends on:** DEV_TASK_1
**PRD ref:** §6.1 Angular Scaffold (routing)

## Goal
Define the app routes and shell layout for Input → Progress → Review.

## Files to create / edit
- `baia-ui/src/app/app.routes.ts` — routes: `''→input`, `progress/:id`, `review/:id`; default redirect to `input`.
- `baia-ui/src/app/app.component.html/.ts` — nav + `<router-outlet>` shell.

## Reuse
- Existing standalone + signals pattern in `app.config.ts`, `app.component.ts`.

## Acceptance criteria
- Router specs: default redirect to input; lazy/standalone route components resolve.
- Global gates (PLAN.md §A7) — Karma/Jasmine.

## Out of scope
Feature components (later S7/S8 tasks).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
