# DEV_TASK_29 — S6-01: Credential/secret handling
**Status:** ✅ Complete

**Section:** S6 — Integrations & Export
**Model tier:** O → Opus 4.8, high effort
**Size:** M
**Depends on:** DEV_TASK_6
**PRD ref:** §4.2 secure credential handling

## Goal
Encrypted-at-rest credential store for repo + Confluence tokens, never logged, plus a reusable redaction helper (consumed by DEV_TASK_18).

## Files to create / edit
- `baia-server/src/security/credential-store.service.ts` — store/retrieve by `credentialsRef`; encrypt at rest (key from env); never log secrets.
- `baia-server/src/security/redaction.ts` — redact known secret patterns/values from arbitrary strings/objects.

## Acceptance criteria
- Tests: round-trip encrypt/decrypt; stored value is ciphertext; **no-leak-in-logs** (spy on logger); redaction masks tokens in DOM/network-like payloads. **≥90% lines** (core-logic module).
- Global gates (PLAN.md §A7).

## Out of scope
Confluence API (DEV_TASK_30).

## Deliverable
Code + tests + completion report (PLAN.md §A4).
