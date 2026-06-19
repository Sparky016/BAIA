/**
 * Contract test: validates that RunsApiService's request/response shapes stay
 * in sync with the baia-shared DTOs and the backend OpenAPI contract.
 *
 * This file does not make real HTTP calls — it asserts structural invariants
 * at the TypeScript level (compile-time) and verifies URL/method conventions
 * at runtime via HttpTestingController.
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { RunRequest, RunStatus, RunSummary } from '@baia/shared';

import { ExportRequest, ExportResult, RunsApiService } from './runs-api.service';

// ── Compile-time shape checks ────────────────────────────────────────────────
// If baia-shared types diverge from what the service declares, the build fails.

const _runRequestShape: RunRequest = {
  targetUrl: 'https://example.com',
  instructions: 'Do something',
  repoUrl: 'https://github.com/org/repo',
  repoProvider: 'github',
  credentialsRef: 'cred-ref',
};

const _runSummaryShape: RunSummary = {
  runId: 'run-1',
  status: RunStatus.Queued,
  targetUrl: 'https://example.com',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ExportRequest must match the backend ExportRunBody contract:
// { baseUrl, spaceKey, credentialsRef, parentPageId? }
const _exportRequestShape: ExportRequest = {
  baseUrl: 'https://mycompany.atlassian.net',
  spaceKey: 'ENG',
  credentialsRef: 'cred-ref',
};

const _exportResultShape: ExportResult = { url: 'https://confluence.example.com/page/1' };

// Keep TS happy — these are only used for shape-checking above.
void _runRequestShape;
void _runSummaryShape;
void _exportRequestShape;
void _exportResultShape;

// ── Runtime contract assertions ───────────────────────────────────────────────

describe('RunsApiService — contract', () => {
  let service: RunsApiService;
  let http: HttpTestingController;

  const BASE = '/api';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RunsApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('createRun — POST /api/runs', () => {
    it('sends a POST to /api/runs', () => {
      service.createRun(_runRequestShape).subscribe();
      const req = http.expectOne(`${BASE}/runs`);
      expect(req.request.method).toBe('POST');
      req.flush(_runSummaryShape);
    });

    it('sends all required RunRequest fields in the body', () => {
      service.createRun(_runRequestShape).subscribe();
      const req = http.expectOne(`${BASE}/runs`);
      const body = req.request.body as RunRequest;
      expect(body.targetUrl).toBe(_runRequestShape.targetUrl);
      expect(body.instructions).toBe(_runRequestShape.instructions);
      expect(body.repoUrl).toBe(_runRequestShape.repoUrl);
      expect(body.repoProvider).toBe(_runRequestShape.repoProvider);
      expect(body.credentialsRef).toBe(_runRequestShape.credentialsRef);
      req.flush(_runSummaryShape);
    });

    it('maps the 201 response to RunSummary', () => {
      let result: RunSummary | undefined;
      service.createRun(_runRequestShape).subscribe((r) => (result = r));
      http.expectOne(`${BASE}/runs`).flush(_runSummaryShape);
      expect(result?.runId).toBe(_runSummaryShape.runId);
      expect(result?.status).toBe(RunStatus.Queued);
      expect(result?.targetUrl).toBe(_runSummaryShape.targetUrl);
    });
  });

  describe('getRun — GET /api/runs/:id', () => {
    const runId = 'run-abc';

    it('sends a GET to /api/runs/:id', () => {
      service.getRun(runId).subscribe();
      const req = http.expectOne(`${BASE}/runs/${runId}`);
      expect(req.request.method).toBe('GET');
      req.flush(_runSummaryShape);
    });

    it('maps the 200 response to RunSummary', () => {
      let result: RunSummary | undefined;
      service.getRun(runId).subscribe((r) => (result = r));
      http.expectOne(`${BASE}/runs/${runId}`).flush({ ..._runSummaryShape, runId });
      expect(result?.runId).toBe(runId);
      expect(result?.status).toBeDefined();
    });
  });

  describe('export — POST /api/runs/:id/export', () => {
    const runId = 'run-xyz';
    const exportReq: ExportRequest = {
      baseUrl: 'https://mycompany.atlassian.net',
      spaceKey: 'ENG',
      credentialsRef: 'cred-ref',
    };

    it('sends a POST to /api/runs/:id/export', () => {
      service.export(runId, exportReq).subscribe();
      const req = http.expectOne(`${BASE}/runs/${runId}/export`);
      expect(req.request.method).toBe('POST');
      req.flush({ url: 'https://confluence.example.com/page' });
    });

    it('sends all required ExportRequest fields matching backend ExportRunBody', () => {
      service.export(runId, exportReq).subscribe();
      const req = http.expectOne(`${BASE}/runs/${runId}/export`);
      const body = req.request.body as ExportRequest;
      // backend ExportRunBody requires: baseUrl, spaceKey, credentialsRef
      expect(body.baseUrl).toBe(exportReq.baseUrl);
      expect(body.spaceKey).toBe(exportReq.spaceKey);
      expect(body.credentialsRef).toBe(exportReq.credentialsRef);
      req.flush({ url: 'https://confluence.example.com/page' });
    });

    it('maps the 200 response to ExportResult with a url field', () => {
      const pageUrl = 'https://confluence.example.com/ENG/page';
      let result: ExportResult | undefined;
      service.export(runId, exportReq).subscribe((r) => (result = r));
      http.expectOne(`${BASE}/runs/${runId}/export`).flush({ url: pageUrl });
      expect(result?.url).toBe(pageUrl);
    });
  });

  describe('proxy path sanity', () => {
    it('all service requests target the /api prefix (proxied to baia-server)', () => {
      // Create run
      service.createRun(_runRequestShape).subscribe();
      const createReq = http.expectOne((r) => r.url.startsWith('/api'));
      expect(createReq.request.url).toMatch(/^\/api/);
      createReq.flush(_runSummaryShape);

      // Get run
      service.getRun('r1').subscribe();
      const getReq = http.expectOne((r) => r.url.startsWith('/api'));
      expect(getReq.request.url).toMatch(/^\/api/);
      getReq.flush(_runSummaryShape);
    });
  });
});
