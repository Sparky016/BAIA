# DEV_TASK_3 — S0-03: Lint/format baseline

**Section:** S0 — Foundations & Tooling
**Model tier:** H → Haiku 4.5, low effort
**Size:** S
**Depends on:** DEV_TASK_1
**PRD ref:** §3

## Goal
One consistent ESLint + Prettier baseline across the Angular and NestJS workspaces so the Section-Eval lint gate is uniform.

## Files to create / edit
- ESLint config for `baia-ui` (Angular ESLint) and `baia-server` (typescript-eslint + Nest rules).
- Shared Prettier config at root.
- `lint` script in each workspace; root `lint` already fans out (DEV_TASK_1).
- Rules: no `any` in new code (warn→error), import ordering, no unused.

## Acceptance criteria
- `npm run lint` runs clean on the current scaffolds (`baia-ui`, `baia-shared`).
- Prettier check wired into lint or a separate `format:check`.
- Global gates (PLAN.md §A7).

## Out of scope
CI wiring (DEV_TASK_5); coverage (DEV_TASK_4).

## Deliverable
Code + completion report (PLAN.md §A4).
