import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { RunsApiService } from './runs-api.service';
import { RunStatus } from '@baia/shared';

describe('RunsApiService', () => {
  let service: RunsApiService;
  let httpController: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RunsApiService);
    httpController = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpController.verify();
  });

  describe('createRun', () => {
    it('POSTs to /api/runs and returns RunSummary on success', () => {
      const request = {
      targetUrl: 'https://example.com',
      instructions: 'Test instructions',
      repoUrl: 'https://github.com/example/repo',
      repoProvider: 'github' as const,
      credentialsRef: 'cred-1',
    };
      const mockResponse = {
        runId: 'run-1',
        status: RunStatus.Review,
        targetUrl: 'https://example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let result: unknown;
      service.createRun(request).subscribe((r) => (result = r));

      const req = httpController.expectOne('/api/runs');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(request);
      req.flush(mockResponse);

      expect(result).toEqual(mockResponse);
    });
  });

  describe('getRun', () => {
    it('GETs /api/runs/:id and returns RunSummary on success', () => {
      const runId = 'run-abc';
      const mockResponse = {
        runId,
        status: RunStatus.Done,
        targetUrl: 'https://example.com',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      let result: unknown;
      service.getRun(runId).subscribe((r) => (result = r));

      const req = httpController.expectOne(`/api/runs/${runId}`);
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);

      expect(result).toEqual(mockResponse);
    });
  });

  describe('export', () => {
    it('POSTs to /api/runs/:id/export and returns ExportResult on success', () => {
      const runId = 'run-xyz';
      const exportRequest = { spaceKey: 'ENG', title: 'My Page' };
      const mockResponse = { url: 'https://confluence.example.com/ENG/My+Page' };

      let result: unknown;
      service.export(runId, exportRequest).subscribe((r) => (result = r));

      const req = httpController.expectOne(`/api/runs/${runId}/export`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(exportRequest);
      req.flush(mockResponse);

      expect(result).toEqual(mockResponse);
    });

    it('propagates HTTP errors on export failure', () => {
      const runId = 'run-err';
      const exportRequest = { spaceKey: 'ENG', title: 'My Page' };

      let error: unknown;
      service.export(runId, exportRequest).subscribe({
        next: () => fail('Expected an error'),
        error: (e) => (error = e),
      });

      const req = httpController.expectOne(`/api/runs/${runId}/export`);
      req.flush('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });

      expect(error).toBeTruthy();
    });
  });
});
