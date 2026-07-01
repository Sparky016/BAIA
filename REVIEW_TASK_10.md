# Task 10 (P2): Close Error-Path Test Coverage Gaps & Repository Hygiene

## Problem

Two unrelated but low-effort cleanup items surfaced during the review:

### A. Test coverage gaps (error paths)

Across the modules reviewed, the happy paths and documented exit gates are well covered, but the following scenarios have **no test coverage today** and should be added alongside (not instead of) the fixes in Tasks 1–6:

- `explore.orchestrator.spec.ts`: behavior when `MAX_STEPS` is hit before the goal is reached (no test verifies the truncated-journey path); a contradictory planner result (`action: null` with `goalReached: false`); an error thrown before the orchestrator's own try block starts (covered by Task 2's fix, needs a matching test).
- `action-planner.service.spec.ts`: unbounded/very large `previousActions` history; identical repeated action returned by the LLM twice in a row.
- `exit-gate.service.spec.ts`: HTTP-status-based 404 without matching DOM text; structural (non-string) repeat detection once Task 3 lands; an alternating fail/succeed/fail pattern.
- `action-executor.service.spec.ts`: retry-then-succeed behavior once Task 3's retry logic lands.
- `runs.sse.controller.spec.ts`: backend pipeline crash propagation to the SSE stream (only happy-path stream completion is tested today); heartbeat frames once Task 4 lands.
- `progress.component.spec.ts`: SSE error/reconnect behavior, stall-warning display, cancel-button flow — all net-new once Task 4 lands.
- `export-panel.component.spec.ts`: export/API failure paths (currently no test simulates a failed `.subscribe({ error })`).
- New `output/*.spec.ts` suite entirely, once Task 1 exists: concurrent write safety, disk-full/permission-denied handling, path-injection rejection, atomic-write-on-crash behavior (ties directly to Task 8).

### B. Repository hygiene

- `.vs/` (Visual Studio's local IDE cache: `CopilotIndices/*.db`, `FileContentIndex/*.vsidx`, `v17/.suo`, `v17/DocumentLayout*.json`) is tracked in git (7 files, confirmed via `git ls-files`) despite being listed in `.gitignore:34`. This means it was committed before the ignore rule took effect and now sits in the repo permanently out of sync with any contributor's actual local IDE state — it should be removed from tracking (`git rm -r --cached .vs`) since `.gitignore` already declares intent to exclude it.
- Verify no other currently-tracked-but-gitignored paths exist (a quick `git ls-files -i --exclude-standard` check) while doing this cleanup, to catch anything similar in one pass.

## Implementation Notes

1. Treat the test-coverage items as a checklist to work through as each corresponding Task (1–6) lands — don't attempt to write tests for behavior that doesn't exist yet (e.g. don't write the cancel-flow test before Task 4's cancel endpoint exists).
2. For the git hygiene item: `git rm -r --cached .vs && git commit -m "chore: stop tracking .vs/ (already gitignored)"`. Confirm this doesn't affect anything else the `.vs` directory might be used for locally (it's purely local Visual Studio tooling state for the `MyCMS` fixture app, safe to untrack).

## Acceptance Criteria

- [ ] Each test-coverage gap listed above has a corresponding new test once its underlying feature/fix lands (tracked per-task, not necessarily all in one PR).
- [ ] `.vs/` is removed from git tracking; `git ls-files -i --exclude-standard` returns no unexpected tracked-but-ignored files.
- [ ] CI coverage thresholds (`README.md` "Coverage & Quality Gates" — ≥85%/80% overall, ≥90% for `llm/`, `explore/`, `reconcile/`, `runs/`) are re-verified to still pass after the new tests are added, and the per-module ≥90% override block in `baia-server/jest.config.js` (currently commented out per its own inline note) is uncommented/activated for `explore/`, `reconcile/`, `runs/`, and the new `output/` once they're stable.

## Affected Files

- `baia-server/src/explore/*.spec.ts`, `baia-server/src/runs/runs.sse.controller.spec.ts`, `baia-server/src/output/*.spec.ts` (new, once Task 1 lands)
- `baia-ui/src/app/progress/progress.component.spec.ts`, `baia-ui/src/app/review/export-panel.component.spec.ts`
- `baia-server/jest.config.js` (per-module coverage threshold activation)
- Repo root: `.vs/` (git tracking removal)
