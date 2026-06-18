import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RunSummary, RunRequest } from '@baia/shared';

export interface ExportRequest {
  spaceKey: string;
  title: string;
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

  export(runId: string, request: ExportRequest): Observable<ExportResult> {
    return this.http.post<ExportResult>(`${this.baseUrl}/runs/${runId}/export`, request);
  }
}
