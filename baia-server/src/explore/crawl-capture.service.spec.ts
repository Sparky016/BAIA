import { ExploreEvent } from '@baia/shared';

import { RunsEventsService } from '../runs/runs.events';
import {
  CapturedStep,
  CrawlCaptureService,
  ExploreTrace,
  NetworkCapture,
} from './crawl-capture.service';

// ---------------------------------------------------------------------------
// Fake Page
// ---------------------------------------------------------------------------

type ResponseHandler = (response: FakeResponse) => void;

interface FakeResponse {
  url: () => string;
  headers: () => Record<string, string>;
  status: () => number;
  request: () => { method: () => string };
  text: () => Promise<string>;
}

function makeFakePage(overrides: {
  url?: string;
  content?: string;
}): {
  url: jest.Mock;
  content: jest.Mock;
  on: jest.Mock;
  _triggerResponse: (response: FakeResponse) => void;
} {
  const handlers: ResponseHandler[] = [];

  return {
    url: jest.fn().mockReturnValue(overrides.url ?? 'https://example.com'),
    content: jest.fn().mockResolvedValue(overrides.content ?? '<html><body>Hello</body></html>'),
    on: jest.fn().mockImplementation((event: string, handler: ResponseHandler) => {
      if (event === 'response') {
        handlers.push(handler);
      }
    }),
    _triggerResponse(response: FakeResponse): void {
      for (const h of handlers) {
        h(response);
      }
    },
  };
}

function makeFakeResponse(overrides: {
  url?: string;
  contentType?: string;
  status?: number;
  method?: string;
  body?: string | (() => Promise<string>);
}): FakeResponse {
  const body = overrides.body ?? 'response body';
  return {
    url: jest.fn().mockReturnValue(overrides.url ?? 'https://api.example.com/data'),
    headers: jest
      .fn()
      .mockReturnValue({ 'content-type': overrides.contentType ?? 'application/json' }),
    status: jest.fn().mockReturnValue(overrides.status ?? 200),
    request: jest.fn().mockReturnValue({
      method: jest.fn().mockReturnValue(overrides.method ?? 'GET'),
    }),
    text:
      typeof body === 'function'
        ? jest.fn().mockImplementation(body)
        : jest.fn().mockResolvedValue(body),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CrawlCaptureService', () => {
  let service: CrawlCaptureService;
  let runsEvents: jest.Mocked<RunsEventsService>;

  beforeEach(() => {
    runsEvents = {
      emit: jest.fn(),
      stream: jest.fn(),
      complete: jest.fn(),
      activeStreams: 0,
    } as unknown as jest.Mocked<RunsEventsService>;

    service = new CrawlCaptureService(runsEvents);
  });

  // ── createTrace ───────────────────────────────────────────────────────────

  describe('createTrace', () => {
    it('returns correct initial shape with runId, empty steps, and a startedAt date', () => {
      const before = new Date();
      const trace: ExploreTrace = service.createTrace('run-42');
      const after = new Date();

      expect(trace.runId).toBe('run-42');
      expect(trace.steps).toEqual([]);
      expect(trace.completedAt).toBeUndefined();
      expect(trace.startedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(trace.startedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('creates independent traces for different runIds', () => {
      const a = service.createTrace('run-a');
      const b = service.createTrace('run-b');
      expect(a.runId).toBe('run-a');
      expect(b.runId).toBe('run-b');
      a.steps.push({} as CapturedStep);
      expect(b.steps).toHaveLength(0);
    });
  });

  // ── captureStep ───────────────────────────────────────────────────────────

  describe('captureStep', () => {
    it('returns a CapturedStep with the correct shape', async () => {
      const page = makeFakePage({ url: 'https://example.com/page', content: '<html />' });
      const before = new Date();
      const step = await service.captureStep('run-1', page as never, 0, 'Page loaded');
      const after = new Date();

      expect(step.stepIndex).toBe(0);
      expect(step.url).toBe('https://example.com/page');
      expect(step.observation).toBe('Page loaded');
      expect(step.domSnapshot).toContain('<html');
      expect(step.networkEvents).toEqual([]);
      expect(step.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(step.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('uses the correct stepIndex in the returned step', async () => {
      const page = makeFakePage({});
      const step3 = await service.captureStep('run-1', page as never, 3, 'Step three');
      expect(step3.stepIndex).toBe(3);
    });

    it('captures the URL from page.url()', async () => {
      const page = makeFakePage({ url: 'https://specific.com/route' });
      const step = await service.captureStep('run-x', page as never, 0, 'obs');
      expect(step.url).toBe('https://specific.com/route');
    });

    it('truncates DOM snapshot to 50000 characters', async () => {
      const longDom = 'a'.repeat(60000);
      const page = makeFakePage({ content: longDom });
      const step = await service.captureStep('run-1', page as never, 0, 'obs');
      expect(step.domSnapshot.length).toBe(50000);
    });

    it('redacts Bearer tokens in the DOM snapshot', async () => {
      const dom = '<html><body>Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c</body></html>';
      const page = makeFakePage({ content: dom });
      const step = await service.captureStep('run-1', page as never, 0, 'obs');
      expect(step.domSnapshot).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(step.domSnapshot).toContain('[REDACTED]');
    });

    it('redacts Bearer token patterns in DOM snapshot', async () => {
      const dom = '<script>const token = "Bearer abcdefghijklmnop";</script>';
      const page = makeFakePage({ content: dom });
      const step = await service.captureStep('run-1', page as never, 0, 'obs');
      expect(step.domSnapshot).not.toContain('abcdefghijklmnop');
      expect(step.domSnapshot).toContain('[REDACTED]');
    });
  });

  // ── SSE events ────────────────────────────────────────────────────────────

  describe('SSE progress events', () => {
    it('emits one ExploreEvent per captureStep call', async () => {
      const page = makeFakePage({});
      await service.captureStep('run-events', page as never, 0, 'Step done');
      expect(runsEvents.emit).toHaveBeenCalledTimes(1);
    });

    it('emits an event with type=observation and correct message', async () => {
      const page = makeFakePage({});
      await service.captureStep('run-2', page as never, 2, 'Loaded profile');
      const [calledRunId, event] = runsEvents.emit.mock.calls[0] as [string, ExploreEvent];

      expect(calledRunId).toBe('run-2');
      expect(event.type).toBe('observation');
      expect(event.message).toBe('Step 2: Loaded profile');
    });

    it('emits event details containing url and stepIndex', async () => {
      const page = makeFakePage({ url: 'https://example.com/profile' });
      await service.captureStep('run-3', page as never, 5, 'Profile visible');
      const [, event] = runsEvents.emit.mock.calls[0] as [string, ExploreEvent];

      expect(event.details).toMatchObject({ url: 'https://example.com/profile', stepIndex: 5 });
    });

    it('emits events for multiple steps with correct step indices', async () => {
      const page = makeFakePage({});
      await service.captureStep('run-multi', page as never, 0, 'first');
      await service.captureStep('run-multi', page as never, 1, 'second');

      const msgs = (runsEvents.emit.mock.calls as [string, ExploreEvent][]).map(
        ([, e]) => e.message
      );
      expect(msgs).toContain('Step 0: first');
      expect(msgs).toContain('Step 1: second');
    });
  });

  // ── startNetworkCapture ───────────────────────────────────────────────────

  describe('startNetworkCapture', () => {
    it('registers a response handler and returns an array reference', () => {
      const page = makeFakePage({});
      const captures = service.startNetworkCapture(page as never);

      expect(page.on).toHaveBeenCalledWith('response', expect.any(Function));
      expect(Array.isArray(captures)).toBe(true);
    });

    it('accumulates network events when responses arrive', async () => {
      const page = makeFakePage({});
      const captures = service.startNetworkCapture(page as never);

      const response = makeFakeResponse({ contentType: 'application/json', body: '{"ok":true}' });
      page._triggerResponse(response);
      await new Promise((r) => setTimeout(r, 10));

      expect(captures).toHaveLength(1);
      expect(captures[0].method).toBe('GET');
      expect(captures[0].status).toBe(200);
    });

    it('truncates response body to 2000 characters', async () => {
      const page = makeFakePage({});
      const captures = service.startNetworkCapture(page as never);

      const longBody = 'x'.repeat(5000);
      const response = makeFakeResponse({ contentType: 'application/json', body: longBody });
      page._triggerResponse(response);
      await new Promise((r) => setTimeout(r, 10));

      expect(captures[0].responseBody).toBeDefined();
      expect(captures[0].responseBody!.length).toBe(2000);
    });

    it('redacts secrets in response URLs', async () => {
      const page = makeFakePage({});
      const captures = service.startNetworkCapture(page as never);

      const secretUrl = 'https://api.example.com?token=supersecrettoken123';
      const response = makeFakeResponse({ url: secretUrl, contentType: 'application/json' });
      page._triggerResponse(response);
      await new Promise((r) => setTimeout(r, 10));

      expect(captures[0].url).not.toContain('supersecrettoken123');
      expect(captures[0].url).toContain('[REDACTED]');
    });

    it('redacts secrets in response bodies', async () => {
      const page = makeFakePage({});
      const captures = service.startNetworkCapture(page as never);

      const body = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const response = makeFakeResponse({ contentType: 'text/plain', body });
      page._triggerResponse(response);
      await new Promise((r) => setTimeout(r, 10));

      expect(captures[0].responseBody).not.toContain(
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      );
    });

    it('does not capture responses with non-json/text content-type', async () => {
      const page = makeFakePage({});
      const captures = service.startNetworkCapture(page as never);

      const imageResponse = makeFakeResponse({ contentType: 'image/png' });
      page._triggerResponse(imageResponse);
      await new Promise((r) => setTimeout(r, 10));

      expect(captures).toHaveLength(0);
    });

    it('captures text/html content-type responses', async () => {
      const page = makeFakePage({});
      const captures = service.startNetworkCapture(page as never);

      const htmlResponse = makeFakeResponse({ contentType: 'text/html; charset=utf-8' });
      page._triggerResponse(htmlResponse);
      await new Promise((r) => setTimeout(r, 10));

      expect(captures).toHaveLength(1);
    });

    it('handles response.text() rejection gracefully', async () => {
      const page = makeFakePage({});
      const captures = service.startNetworkCapture(page as never);

      const response = makeFakeResponse({
        contentType: 'application/json',
        body: () => Promise.reject(new Error('body unavailable')),
      });
      page._triggerResponse(response);
      await new Promise((r) => setTimeout(r, 10));

      expect(captures).toHaveLength(1);
      expect(captures[0].responseBody).toBeUndefined();
    });
  });
});
