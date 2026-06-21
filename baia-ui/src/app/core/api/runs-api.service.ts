import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RunSummary, RunRequest } from '@baia/shared';

export interface ExportRequest {
  baseUrl: string;
  spaceKey: string;
  credentialsRef: string;
  parentPageId?: string;
}

export interface ExportResult {
  url: string;
}

@Injectable({ providedIn: 'root' })
export class RunsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api';

  createRun(request: RunRequest): Observable<RunSummary> {
    return this.http.post<RunSummary>(`${this.baseUrl}/runs`, request);
  }

  getRun(runId: string): Observable<RunSummary> {
    return this.http.get<RunSummary>(`${this.baseUrl}/runs/${runId}`);
  }

  startRun(runId: string, request: RunRequest): Observable<{ accepted: boolean; runId: string }> {
    return this.http.post<{ accepted: boolean; runId: string }>(
      `${this.baseUrl}/runs/${runId}/start`,
      { instructions: request.instructions }
    );
  }

  export(runId: string, request: ExportRequest): Observable<ExportResult> {
    return this.http.post<ExportResult>(`${this.baseUrl}/runs/${runId}/export`, request);
  }

  downloadGherkin(runId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/runs/${runId}/export/gherkin`, { responseType: 'blob' });
  }

  downloadOkf(runId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/runs/${runId}/export/okf`, { responseType: 'blob' });
  }
}
