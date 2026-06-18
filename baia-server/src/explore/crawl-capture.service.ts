import { ExploreEvent } from '@baia/shared';
import { Injectable } from '@nestjs/common';
import { Page, Response } from 'playwright';

import { redactString } from '../security/redaction';
import { RunsEventsService } from '../runs/runs.events';

export interface NetworkCapture {
  url: string;
  method: string;
  status?: number;
  responseBody?: string;
}

export interface CapturedStep {
  stepIndex: number;
  timestamp: Date;
  url: string;
  domSnapshot: string;
  networkEvents: NetworkCapture[];
  observation: string;
}

export interface ExploreTrace {
  runId: string;
  steps: CapturedStep[];
  startedAt: Date;
  completedAt?: Date;
}

const DOM_SNAPSHOT_MAX_LENGTH = 50000;
const RESPONSE_BODY_MAX_LENGTH = 2000;

@Injectable()
export class CrawlCaptureService {
  constructor(private readonly runsEventsService: RunsEventsService) {}

  async captureStep(
    runId: string,
    page: Page,
    stepIndex: number,
    observation: string
  ): Promise<CapturedStep> {
    const url = page.url();
    const rawDom = await page.content();
    const domSnapshot = redactString(rawDom).slice(0, DOM_SNAPSHOT_MAX_LENGTH);

    const event: ExploreEvent = {
      timestamp: new Date(),
      type: 'observation',
      message: `Step ${stepIndex}: ${observation}`,
      details: { url, stepIndex },
    };
    this.runsEventsService.emit(runId, event);

    return {
      stepIndex,
      timestamp: new Date(),
      url,
      domSnapshot,
      networkEvents: [],
      observation,
    };
  }

  startNetworkCapture(page: Page): NetworkCapture[] {
    const captures: NetworkCapture[] = [];

    page.on('response', (response: Response) => {
      const contentType = response.headers()['content-type'] ?? '';
      const isCaptureable =
        contentType.includes('application/json') || contentType.includes('text/');

      if (!isCaptureable) {
        return;
      }

      const capture: NetworkCapture = {
        url: redactString(response.url()),
        method: response.request().method(),
        status: response.status(),
      };

      response
        .text()
        .then((body) => {
          capture.responseBody = redactString(body).slice(0, RESPONSE_BODY_MAX_LENGTH);
        })
        .catch(() => {
          // Response body unavailable — leave responseBody undefined.
        });

      captures.push(capture);
    });

    return captures;
  }

  createTrace(runId: string): ExploreTrace {
    return {
      runId,
      steps: [],
      startedAt: new Date(),
    };
  }
}
