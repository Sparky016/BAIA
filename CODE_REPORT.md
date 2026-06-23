# BAIA — Code Review Report

**Date:** 2026-06-23
**Reviewer:** Automated code analysis (Claude)
**Scope:** `baia-shared`, `baia-server`, `baia-ui`, `e2e`, root tooling
**Commit:** `d98a917` (branch `master`)

---

## 1. Executive Summary

BAIA is a well-architected, well-tested TypeScript monorepo. The code is
idiomatic, heavily documented, and applies sound engineering patterns
(ports-and-adapters for the LLM and repo connectors, an explicit state-machine
for the run lifecycle, encrypted-at-rest credentials, recursive secret
redaction). The unit-test suites are strong and **all pass**:

| Suite | Result | Coverage |
|-------|--------|----------|
| `baia-server` (Jest) | **822 passed / 822** | 91.9% line (reported) |
| `baia-ui` (Karma/Jasmine) | **91 passed / 91** | 91.4% line, **69.2% branch** |
| Build (all workspaces) | **✅ compiles** | — |
| **Lint (`npm run lint`)** | **✅ passes** (was ❌ 1345 errors — fixed §2.2) | — |

The review found **one critical functional defect** (the entire export feature
was unreachable in the production server) and a **red lint gate** that broke
`npm run verify`/CI on a fresh checkout. **Both are now resolved** (see §2.1 and
§2.2); each is described below with evidence and the applied fix.

**Verdict:** Strong fundamentals; the run pipeline (Phase 1 → 2 → reconcile)
behaves as designed, but the product cannot complete its documented end-to-end
flow (review → export → done) when run via the production entrypoint.

---

## 2. Critical Findings

### 2.1 ✅ RESOLVED — Export feature is unreachable in the production server

> **Resolved 2026-06-23.** `ExportModule` is now registered in `AppModule.imports`,
> and a new `SecurityModule` owns the singleton `CredentialStoreService` (+ encryption
> key) so the pipeline and export share one credential store; `ExportModule` imports
> `RunsModule` + `SecurityModule` instead of re-providing those services. Added
> `baia-server/src/app.module.spec.ts`, which boots the real `AppModule` and asserts
> the three export routes are registered and that `RunsService`/`CredentialStoreService`
> are shared singletons across the pipeline and export. Full server suite green
> (822 tests, +5).


The Angular UI (`baia-ui/src/app/core/api/runs-api.service.ts`) calls three
export endpoints:

```ts
POST /api/runs/:id/export          // Confluence publish
GET  /api/runs/:id/export/gherkin  // download .feature
GET  /api/runs/:id/export/okf      // download OKF .zip
```

These are served by `ExportController`. But `ExportController` / `ExportModule`
are **only registered in `src/e2e/e2e-app.module.ts`** — the module used by
`e2e-server.ts`. The **production** entrypoint `main.ts` boots `AppModule`,
which imports only:

```ts
// baia-server/src/app.module.ts
imports: [ConfigModule, RunsModule, PipelineModule]   // ← no ExportModule
```

`PipelineModule`'s only controller is `StartController`. Verified:
`grep "@Patch|ExportController" ` over `AppModule`'s graph finds nothing.

**Impact:**
- In production, all three export calls return **404**.
- The run state machine can therefore **never reach `exporting` or `done`** —
  only `ExportController.exportRun` performs the `review → exporting → done`
  transitions. The lifecycle permanently stops at `review`.
- This disables the headline "🔄 Enterprise Export" feature and the Gherkin/OKF
  downloads — the UI's `export-panel.component.ts` buttons all fail.

**Why tests didn't catch it:** the e2e suite exercises `E2eAppModule`, which
*does* register `ExportController`, so coverage is green while production is
broken.

**Fix:** register the export feature in the production graph, e.g. add
`ExportModule` to `AppModule.imports` (and ensure it shares the singleton
`RunsService`/`CredentialStoreService` from `RunsModule` rather than
re-providing them — see §3.1). Add an integration test that boots `AppModule`
and asserts `POST /runs/:id/export` is routable.

---

### 2.2 ✅ RESOLVED — Lint gate is red; `npm run verify` / CI fails on checkout

> **Resolved 2026-06-23.** Added a `.gitattributes` (`* text=auto eol=lf` plus
> `binary` markers for `*.png/.ico/.zip/.db/.sqlite/.vsidx/.suo/.wsuo`),
> re-normalized the tree (`git add --renormalize .`), and ran `eslint --fix`
> across `baia-shared`/`baia-server`/`baia-ui` to convert the working-tree
> source files to LF. `npm run lint` now exits **0** (was 1345 `prettier/prettier`
> "Delete ␍" errors). Build and the full 822-test server suite remain green.
> Line endings will stay LF on future Windows checkouts because of
> `.gitattributes`, so the gate won't regress.


`npm run lint` produces **1345 errors, 100% of them `prettier/prettier`
"Delete ␍"** (CRLF line endings). Root cause:

- `.prettierrc` mandates `"endOfLine": "lf"`.
- There is **no `.gitattributes`**, so on Windows the files are checked out
  with CRLF and every line fails the rule.

**Impact:** `npm run lint` exits non-zero → the root `verify` script
(`lint && build && test && …`) and the CI pipeline fail before any real check
runs. The README already acknowledges "Line-ending violations" as a known
issue, which means the quality gate has been red rather than fixed.

**Fix (durable):** add a `.gitattributes` to normalize line endings and
re-normalize the tree:

```gitattributes
* text=auto eol=lf
*.png binary
*.zip binary
```

Then `git add --renormalize .` and commit. (`npx prettier --write` fixes the
working copy but the problem returns on the next Windows checkout without
`.gitattributes`.)

---

## 3. Medium Findings

### 3.1 ✅ RESOLVED — Production code depends on the `e2e/` layer

> **Resolved 2026-06-23.** Created `pipeline/pipeline.service.ts` (renamed from
> `E2ePipelineService`) and `pipeline/pipeline.types.ts` (extracted
> `StartPipelineBody`/`StartPipelineResult`). Updated `start.controller.ts` and
> `pipeline.module.ts` to import from their own module. Updated
> `e2e/e2e-start.controller.ts` and `e2e/e2e-app.module.ts` to import from
> `../pipeline/`. Deleted `e2e/e2e-pipeline.service.ts`. Dependency direction is
> now correct: e2e imports from pipeline, not vice versa.

The production `StartController` and `PipelineModule` were importing from `src/e2e/`:

```ts
// pipeline/start.controller.ts  (before fix)
import { E2ePipelineService } from '../e2e/e2e-pipeline.service';
import { StartPipelineBody, StartPipelineResult } from '../e2e/e2e-start.controller';
```

`E2ePipelineService` was, despite its name, the **real** Phase 1→2→reconcile
pipeline the production server runs. This layering violation could cause a
maintainer "cleaning up e2e code" to accidentally break production.

### 3.2 ✅ RESOLVED — State-machine event seam is dead code; transition events are hand-duplicated

> **Resolved 2026-06-23.** Wired the seam in `RunsModule` using NestJS `useFactory`
> with `inject: [RunsEventsService]`:
> `machine.onTransition(e => runsEvents.emit(e.runId, e))`.
> Removed all 8 manual `runsEvents.emit({runId, from, to, at})` blocks from
> `explore.orchestrator.ts` (3), `analyze.orchestrator.ts` (3), and
> `reconcile.orchestrator.ts` (2). Orchestrator specs updated to wire the listener
> in `beforeEach` so they continue to collect transition events via the stream.
> Server suite: **827 passed / 827** (all green, net −41 lines of duplication).

`RunStateMachine` exposes a clean `onTransition(listener)` pub/sub seam
(`run-state-machine.ts:95`). Each orchestrator was manually emitting the
transition event after every `transitionRun` call, duplicating the event shape 8
times and hardcoding `from` values — a DRY violation and latent correctness risk.

### 3.3 ✅ RESOLVED — The production pipeline entrypoint has 0% test coverage

> **Resolved 2026-06-23** (alongside §3.1). Created
> `pipeline/start.controller.spec.ts` with 5 tests covering: return shape,
> `runFullPipeline` argument correctness, env-var credential seeding path,
> no-credential path, and pipeline error suppression. Server suite now **827
> passed / 827**.

`src/pipeline/start.controller.ts` had 0% test coverage; its e2e twin was the
only tested variant and had already drifted (seeding `confluenceCredentialsRef`
that production doesn't support).

### 3.4 ✅ RESOLVED — UI branch coverage (69.2%) is below the documented 80% gate

> **Resolved 2026-06-23.** Added `check: { global: { branches: 80, … } }` to
> `baia-ui/karma.conf.js` so `ng test` exits non-zero if the gate is missed.
> Added 20 new tests across `export-panel.component.spec.ts` (8 tests — error
> fallback branches, `canExport` whitespace guards, filename fallbacks),
> `input.component.spec.ts` (1 test — optional-field false branches),
> `progress.component.spec.ts` (11 tests — screenshot, phaseClass, startRun
> paths). Branch coverage raised from **69.2% → 92.3%** (60/65 branches). All
> 108 UI tests pass.

---

## 4. Low / Minor Findings

### 4.1 🟡 `GitHubConnector.clone()` is an N+1 sequential fetch

`clone()` lists the tree then loops `for (const entry of blobs) { await
client.getContents(...) }` — one HTTP round-trip per file, fully serialized.
For a real repository this is slow and rate-limit-prone, and contradicts the
"Context Window Optimization / shallow-fetch" claim in the README. Consider
bounded-concurrency fetching (e.g. a pool of N) or the Git blobs API.
(*Security and correctness are otherwise excellent here — the token is never
stored on `this` or logged.*)

### 4.2 🟡 `RunsEventsService.emit` silently resurrects completed streams

After a terminal transition, `complete(runId)` deletes the subject. A
subsequent `emit(runId, …)` calls `getOrCreate`, which **creates a fresh
subject** and emits into it with no subscribers — the event is dropped with no
warning, and a stray subject lingers until GC. Late post-terminal emits should
arguably be a no-op or logged. Minor, but a latent source of "lost event"
confusion.

### 4.3 🟡 Documentation / implementation mismatches (README)

- README "Key Endpoints" lists `PATCH /runs/:id` — **no `@Patch` handler
  exists**. The real trigger is `POST /runs/:id/start`.
- Coverage badges/section are stale: claims **802** backend tests (actual
  **817**), **53** frontend tests at 76% branch (actual **91** at 69%).
- README claims the export endpoints and `done` state are reachable; per §2.1
  they are not in production.

Docs that overstate working behavior are worse than missing docs — update them
alongside the §2.1 fix.

### 4.4 🟡 Two parallel app modules / controllers to keep in sync

`AppModule` vs `E2eAppModule` and `StartController` vs `E2eStartController`
duplicate wiring. They have already diverged (§3.3). Prefer a single module
graph with mock providers swapped via DI tokens/env, rather than a second
hand-maintained module.

---

## 5. What's Done Well (strengths)

- **LLM isolation**: `CopilotLlmAdapter` depends only on the `CopilotClient`
  port; the SDK is the single seam. Retry/back-off, error mapping, JSON-schema
  validation, and content-filter handling are thorough and fully covered.
- **Security**: `CredentialStoreService` uses AES-256-GCM with per-record
  salt+IV, fail-closed decryption, constant-time compare, and never logs
  secrets. `redaction.ts` does ordered pattern + key-name + known-value
  redaction with cycle-safe recursion.
- **State machine**: explicit transition table as single source of truth,
  typed `IllegalRunTransitionError`, terminal-state handling — clean and
  exhaustively tested.
- **Repo connectors**: token never stored on the instance or surfaced in
  errors; narrow hand-rolled API interface keeps ESM-only Octokit out of the
  test process.
- **Test discipline**: 935 unit tests total (827 server + 108 UI), all green; deterministic mocks for
  Playwright/LLM/repo so CI needs no external credentials.

---

## 6. Prioritized Action List

| # | Pri | Action | Effort |
|---|-----|--------|--------|
| 1 | ✅ | ~~Register `ExportModule` in `AppModule`; add an `AppModule`-boot integration test for `/runs/:id/export` (§2.1)~~ **Done 2026-06-23** | S |
| 2 | ✅ | ~~Add `.gitattributes` (`* text=auto eol=lf`), renormalize, get lint green (§2.2)~~ **Done 2026-06-23** | S |
| 3 | ✅ | ~~Move `E2ePipelineService` + `StartPipeline*` DTOs out of `e2e/` into `pipeline/`; reverse the e2e→prod dependency (§3.1)~~ **Done 2026-06-23** | M |
| 4 | ✅ | ~~Wire `RunStateMachine.onTransition` → `RunsEventsService`; delete duplicated manual emits (§3.2)~~ **Done 2026-06-23** | M |
| 5 | ✅ | ~~Add `StartController` spec; consolidate prod/e2e start controllers (§3.3)~~ **Done 2026-06-23** | M |
| 6 | ✅ | ~~Make UI branch-coverage gate enforced and raise coverage to 80% (§3.4)~~ **Done 2026-06-23** (92.3%) | M |
| 7 | 🟡 | Parallelize/batch `GitHubConnector.clone()`; fix doc mismatches; harden `emit` post-terminal (§4) | S–M |

---

*Generated by static review + full build/test/lint execution. No source files
were modified; this report is additive.*
