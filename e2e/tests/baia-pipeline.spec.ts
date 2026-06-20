/**
 * S9-02 End-to-end test: full BAIA pipeline against mock fixtures.
 *
 * Stages covered:
 *   1. Input    – POST /api/runs (creates a queued run)
 *   2. Progress – SSE stream /api/runs/:id/events (observes status transitions)
 *   3. Review   – GET /api/runs/:id (run has reached 'review' with a UnifiedDoc)
 *   4. Export   – POST /api/runs/:id/export (pushes to mock Confluence)
 *
 * Fixture servers started by Playwright's webServer config:
 *   - mock-mycms (port 4001) — serves simple HTML for Playwright crawl
 *   - mock-confluence (port 4002) — fake Confluence REST API
 *   - baia-server E2E edition (port 3001) — full NestJS app with MockLlmService
 *
 * All LLM calls are served by MockLlmService so the test is deterministic.
 * No browser binaries required — MockExploreOrchestrator simulates Phase 1.
 */
import { expect, test } from '@playwright/test';

const API = 'http://localhost:3001/api';
const CONFLUENCE_BASE = 'http://localhost:4002';
const CONFLUENCE_SPACE = 'TEST';
const REPO_CREDS_REF = 'e2e-repo-creds';
const CONFLUENCE_CREDS_REF = 'e2e-confluence-creds';
const MYCMS_URL = 'http://localhost:4001';

/** Status values that signal the Progress stage is finished for this test. */
const STOP_STATUSES = new Set(['review', 'done', 'failed']);

// ── Subset of RunSummary we care about ────────────────────────────────────────

interface RunSummary {
  runId: string;
  status: string;
  targetUrl: string;
  unifiedDoc?: unknown;
  gherkinDoc?: unknown;
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

/**
 * Opens an SSE connection and awaits the server's response headers so that
 * the server-side Subject is guaranteed to exist before the pipeline starts.
 * Returns the body reader so the caller can collect events separately.
 */
async function openSseStream(runId: string): Promise<{
  reader: ReadableStreamDefaultReader<Uint8Array>;
  controller: AbortController;
}> {
  const controller = new AbortController();
  // Awaiting fetch() here ensures the HTTP connection is established and the
  // server has subscribed to the RunsEventsService Subject for this runId.
  const response = await fetch(`${API}/runs/${runId}/events`, {
    signal: controller.signal,
  });
  if (!response.body) throw new Error('SSE response has no body');
  return { reader: response.body.getReader(), controller };
}

/**
 * Read SSE frames from the supplied reader until a status in STOP_STATUSES is
 * seen or the stream closes naturally.  Returns the list of `to` statuses from
 * RunTransitionEvents.
 */
async function collectSseStatuses(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController,
): Promise<string[]> {
  const statuses: string[] = [];
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const json = trimmed.slice('data:'.length).trim();
        if (!json) continue;

        try {
          const event = JSON.parse(json) as Record<string, unknown>;
          if (typeof event['to'] === 'string') {
            const status = event['to'] as string;
            statuses.push(status);
            if (STOP_STATUSES.has(status)) return statuses;
          }
        } catch {
          // Ignore non-JSON SSE frames (heartbeats, comments, etc.)
        }
      }
    }
  } finally {
    controller.abort();
    reader.cancel().catch(() => {});
  }

  return statuses;
}

// ── SSE helpers (extended) ────────────────────────────────────────────────────

interface SseCollectionResult {
  statuses: string[];
  observationMessages: string[];
}

/**
 * Like collectSseStatuses but also captures ExploreEvent observation messages.
 * Stops on the first STOP_STATUSES transition, same as the simpler helper.
 */
async function collectSseEvents(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController,
): Promise<SseCollectionResult> {
  const statuses: string[] = [];
  const observationMessages: string[] = [];
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const json = trimmed.slice('data:'.length).trim();
        if (!json) continue;

        try {
          const event = JSON.parse(json) as Record<string, unknown>;
          if (typeof event['to'] === 'string') {
            const status = event['to'] as string;
            statuses.push(status);
            if (STOP_STATUSES.has(status)) return { statuses, observationMessages };
          } else if (event['type'] === 'observation' && typeof event['message'] === 'string') {
            observationMessages.push(event['message'] as string);
          }
        } catch {
          // Ignore non-JSON SSE frames (heartbeats, comments, etc.)
        }
      }
    }
  } finally {
    controller.abort();
    reader.cancel().catch(() => {});
  }

  return { statuses, observationMessages };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('full BAIA pipeline: Input → Progress → Review → Export', async ({ request }) => {
  // ── Stage 1: Input ───────────────────────────────────────────────────────

  const createRes = await request.post(`${API}/runs`, {
    data: {
      targetUrl: MYCMS_URL,
      instructions:
        'Navigate the MyCMS home page, explore the navigation links, and document the visible content.',
      repoUrl: 'https://github.com/mock-org/MyCMS',
      repoProvider: 'github',
      credentialsRef: REPO_CREDS_REF,
    },
  });

  expect(createRes.status()).toBe(201);
  const run = (await createRes.json()) as RunSummary;
  expect(run.runId).toMatch(/^run-\d{4}$/);
  expect(run.status).toBe('queued');
  expect(run.targetUrl).toBe(MYCMS_URL);

  const { runId } = run;

  // ── Stage 2: Progress (SSE) ──────────────────────────────────────────────

  // Establish the SSE connection BEFORE triggering the pipeline.
  // Awaiting openSseStream() ensures the server-side Subject for this runId
  // exists and has an active subscriber when events start flowing.
  const { reader, controller } = await openSseStream(runId);

  // Now trigger the pipeline (it emits into the already-subscribed Subject).
  const startRes = await request.post(`${API}/runs/${runId}/start`, {
    data: {
      instructions:
        'Navigate the MyCMS home page, explore the navigation links, and document the visible content.',
      repoUrl: 'https://github.com/mock-org/MyCMS',
      repoProvider: 'github',
      credentialsRef: REPO_CREDS_REF,
      confluenceCredentialsRef: CONFLUENCE_CREDS_REF,
    },
  });

  expect(startRes.status()).toBe(202);
  const startBody = (await startRes.json()) as { accepted: boolean; runId: string };
  expect(startBody.accepted).toBe(true);
  expect(startBody.runId).toBe(runId);

  // Collect SSE events until 'review' (or a terminal state) is observed.
  const statuses = await collectSseStatuses(reader, controller);

  // The pipeline must pass through all four phases before reaching 'review'.
  expect(statuses).toContain('exploring');
  expect(statuses).toContain('analyzing');
  expect(statuses).toContain('reconciling');
  expect(statuses).toContain('review');
  expect(statuses).not.toContain('failed');

  // ── Stage 3: Review ──────────────────────────────────────────────────────

  const reviewRes = await request.get(`${API}/runs/${runId}`);
  expect(reviewRes.status()).toBe(200);

  const reviewRun = (await reviewRes.json()) as RunSummary;
  expect(reviewRun.status).toBe('review');

  // The run must carry generated documentation (unifiedDoc preferred, gherkinDoc as fallback).
  const hasDoc = reviewRun.unifiedDoc !== undefined || reviewRun.gherkinDoc !== undefined;
  expect(hasDoc).toBe(true);

  // ── Stage 4: Export ──────────────────────────────────────────────────────

  const exportRes = await request.post(`${API}/runs/${runId}/export`, {
    data: {
      baseUrl: CONFLUENCE_BASE,
      spaceKey: CONFLUENCE_SPACE,
      credentialsRef: CONFLUENCE_CREDS_REF,
    },
  });

  expect(exportRes.status()).toBe(200);
  const exportBody = (await exportRes.json()) as { url: string };
  expect(exportBody.url).toMatch(/^http:\/\/localhost:4002\/wiki\//);

  // ── Final state ──────────────────────────────────────────────────────────

  const finalRes = await request.get(`${API}/runs/${runId}`);
  expect(finalRes.status()).toBe(200);
  const finalRun = (await finalRes.json()) as RunSummary;
  expect(finalRun.status).toBe('done');
});

test('no-repo pipeline: Phase 2 skipped — still reaches review with empty conflicts', async ({ request }) => {
  // ── Stage 1: Input (no repo fields) ─────────────────────────────────────

  const createRes = await request.post(`${API}/runs`, {
    data: {
      targetUrl: MYCMS_URL,
      instructions:
        'Navigate the MyCMS home page, explore the navigation links, and document the visible content.',
    },
  });

  expect(createRes.status()).toBe(201);
  const run = (await createRes.json()) as RunSummary;
  expect(run.runId).toMatch(/^run-\d{4}$/);
  expect(run.status).toBe('queued');
  expect(run.targetUrl).toBe(MYCMS_URL);

  const { runId } = run;

  // ── Stage 2: Progress (SSE) ──────────────────────────────────────────────

  const { reader, controller } = await openSseStream(runId);

  // Start pipeline with no repo fields — Phase 2 will be skipped.
  const startRes = await request.post(`${API}/runs/${runId}/start`, {
    data: {
      instructions:
        'Navigate the MyCMS home page, explore the navigation links, and document the visible content.',
      confluenceCredentialsRef: CONFLUENCE_CREDS_REF,
    },
  });

  expect(startRes.status()).toBe(202);
  const startBody = (await startRes.json()) as { accepted: boolean; runId: string };
  expect(startBody.accepted).toBe(true);
  expect(startBody.runId).toBe(runId);

  // Collect SSE events including observation messages.
  const { statuses, observationMessages } = await collectSseEvents(reader, controller);

  // Run still passes through all status transitions despite Phase 2 being skipped.
  expect(statuses).toContain('exploring');
  expect(statuses).toContain('analyzing');
  expect(statuses).toContain('reconciling');
  expect(statuses).toContain('review');
  expect(statuses).not.toContain('failed');

  // The skip must be observable via the SSE observation event emitted by Phase 2.
  expect(observationMessages.some(m => m.includes('Skipping code analysis'))).toBe(true);

  // ── Stage 3: Review — doc shape ──────────────────────────────────────────

  const reviewRes = await request.get(`${API}/runs/${runId}`);
  expect(reviewRes.status()).toBe(200);

  const reviewRun = (await reviewRes.json()) as RunSummary & {
    unifiedDoc?: { features: Array<{ scenarios: Array<{ name: string }> }>; conflicts: unknown[] };
    gherkinDoc?: unknown;
  };
  expect(reviewRun.status).toBe('review');

  // A gherkin doc must exist (Phase 1 produced it) even without code analysis.
  expect(reviewRun.gherkinDoc).toBeDefined();

  // The unified doc must exist and have no conflicts (no code rules to conflict with).
  expect(reviewRun.unifiedDoc).toBeDefined();
  expect(reviewRun.unifiedDoc!.conflicts).toHaveLength(0);

  // No scenarios should be named "Code Rule: …" since Phase 2 produced no rules.
  const allScenarioNames = reviewRun.unifiedDoc!.features.flatMap(f =>
    f.scenarios.map(s => s.name),
  );
  expect(allScenarioNames.every(name => !name.startsWith('Code Rule:'))).toBe(true);

  // ── Stage 4: Export ──────────────────────────────────────────────────────

  const exportRes = await request.post(`${API}/runs/${runId}/export`, {
    data: {
      baseUrl: CONFLUENCE_BASE,
      spaceKey: CONFLUENCE_SPACE,
      credentialsRef: CONFLUENCE_CREDS_REF,
    },
  });

  expect(exportRes.status()).toBe(200);
  const exportBody = (await exportRes.json()) as { url: string };
  expect(exportBody.url).toMatch(/^http:\/\/localhost:4002\/wiki\//);

  // ── Final state ──────────────────────────────────────────────────────────

  const finalRes = await request.get(`${API}/runs/${runId}`);
  expect(finalRes.status()).toBe(200);
  const finalRun = (await finalRes.json()) as RunSummary;
  expect(finalRun.status).toBe('done');
});
