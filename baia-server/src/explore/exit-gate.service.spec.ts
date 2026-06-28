import { CapturedStep } from './crawl-capture.service';
import { ExitGateService } from './exit-gate.service';

function makeStep(overrides: Partial<CapturedStep> = {}): CapturedStep {
  return {
    stepIndex: 0,
    timestamp: new Date(),
    url: 'https://example.com',
    domSnapshot: '<html><body><h1>Welcome</h1></body></html>',
    networkEvents: [],
    observation: 'Clicked button',
    ok: true,
    ...overrides,
  };
}

describe('ExitGateService', () => {
  let service: ExitGateService;

  beforeEach(() => {
    service = new ExitGateService();
  });

  describe('checkStep — no exit conditions', () => {
    it('returns continue for an empty steps array', () => {
      const result = service.checkStep([]);
      expect(result.shouldExit).toBe(false);
      expect(result.exitReason).toBeNull();
    });

    it('returns continue for a normal page', () => {
      const result = service.checkStep([makeStep()]);
      expect(result.shouldExit).toBe(false);
    });

    it('does not trigger repeated-result with only 2 identical steps', () => {
      const steps = [
        makeStep({ url: 'https://example.com', observation: 'same' }),
        makeStep({ url: 'https://example.com', observation: 'same' }),
      ];
      const result = service.checkStep(steps);
      expect(result.shouldExit).toBe(false);
    });

    it('does not trigger 404 when DOM contains "404" without a not-found phrase', () => {
      const dom = '<html><body><p>Error code: 404</p></body></html>';
      const result = service.checkStep([makeStep({ domSnapshot: dom })]);
      expect(result.shouldExit).toBe(false);
    });

    it('does not trigger 404 when DOM contains "not found" without "404"', () => {
      const dom = '<html><body><p>The item was not found in the results.</p></body></html>';
      const result = service.checkStep([makeStep({ domSnapshot: dom })]);
      expect(result.shouldExit).toBe(false);
    });
  });

  describe('checkStep — 404 detection', () => {
    it('detects "404 not found" in title', () => {
      const dom = '<html><head><title>404 Not Found</title></head><body></body></html>';
      const result = service.checkStep([makeStep({ domSnapshot: dom })]);
      expect(result.shouldExit).toBe(true);
      expect(result.exitReason).toBe('404-detected');
    });

    it('detects "404 page not found" in heading', () => {
      const dom = '<html><body><h1>404 Page Not Found</h1></body></html>';
      const result = service.checkStep([makeStep({ domSnapshot: dom })]);
      expect(result.shouldExit).toBe(true);
      expect(result.exitReason).toBe('404-detected');
    });

    it('detects "does not exist" variant', () => {
      const dom = '<html><body><p>404 — This page does not exist.</p></body></html>';
      const result = service.checkStep([makeStep({ domSnapshot: dom })]);
      expect(result.shouldExit).toBe(true);
      expect(result.exitReason).toBe('404-detected');
    });

    it('is case-insensitive', () => {
      const dom = '<HTML><BODY><H1>404 NOT FOUND</H1></BODY></HTML>';
      const result = service.checkStep([makeStep({ domSnapshot: dom })]);
      expect(result.shouldExit).toBe(true);
      expect(result.exitReason).toBe('404-detected');
    });

    it('includes the page URL in the message', () => {
      const dom = '<html><body><h1>404 Not Found</h1></body></html>';
      const result = service.checkStep([makeStep({ url: 'https://example.com/missing', domSnapshot: dom })]);
      expect(result.message).toContain('https://example.com/missing');
    });
  });

  describe('checkStep — repeated-result detection', () => {
    it('triggers when the last 3 steps share identical url and observation', () => {
      const steps = [
        makeStep({ url: 'https://example.com', observation: 'nothing changed' }),
        makeStep({ url: 'https://example.com', observation: 'nothing changed' }),
        makeStep({ url: 'https://example.com', observation: 'nothing changed' }),
      ];
      const result = service.checkStep(steps);
      expect(result.shouldExit).toBe(true);
      expect(result.exitReason).toBe('repeated-result');
    });

    it('does not trigger when URLs differ across last 3 steps', () => {
      const steps = [
        makeStep({ url: 'https://example.com/a', observation: 'same' }),
        makeStep({ url: 'https://example.com/b', observation: 'same' }),
        makeStep({ url: 'https://example.com/c', observation: 'same' }),
      ];
      const result = service.checkStep(steps);
      expect(result.shouldExit).toBe(false);
    });

    it('does not trigger when observations differ across last 3 steps', () => {
      const steps = [
        makeStep({ url: 'https://example.com', observation: 'clicked A' }),
        makeStep({ url: 'https://example.com', observation: 'clicked B' }),
        makeStep({ url: 'https://example.com', observation: 'clicked C' }),
      ];
      const result = service.checkStep(steps);
      expect(result.shouldExit).toBe(false);
    });

    it('evaluates only the last 3 when more steps are present', () => {
      const steps = [
        makeStep({ url: 'https://example.com/a', observation: 'different' }),
        makeStep({ url: 'https://example.com/b', observation: 'different' }),
        makeStep({ url: 'https://example.com', observation: 'stuck' }),
        makeStep({ url: 'https://example.com', observation: 'stuck' }),
        makeStep({ url: 'https://example.com', observation: 'stuck' }),
      ];
      const result = service.checkStep(steps);
      expect(result.shouldExit).toBe(true);
      expect(result.exitReason).toBe('repeated-result');
    });
  });

  describe('checkStep — repeated-failure detection', () => {
    it('triggers when the last 3 steps all have ok: false', () => {
      const steps = [
        makeStep({ ok: false, observation: 'timeout A' }),
        makeStep({ ok: false, observation: 'timeout B' }),
        makeStep({ ok: false, observation: 'timeout C' }),
      ];
      const result = service.checkStep(steps);
      expect(result.shouldExit).toBe(true);
      expect(result.exitReason).toBe('repeated-failure');
    });

    it('does not trigger when one of the last 3 steps has ok: true', () => {
      const steps = [
        makeStep({ ok: false, observation: 'fail 1' }),
        makeStep({ ok: true, observation: 'success' }),
        makeStep({ ok: false, observation: 'fail 2' }),
      ];
      const result = service.checkStep(steps);
      expect(result.shouldExit).toBe(false);
    });
  });

  describe('checkStep — priority (404 before repeated-result)', () => {
    it('returns 404-detected when both conditions are true', () => {
      const dom = '<html><body><h1>404 Not Found</h1></body></html>';
      const steps = [
        makeStep({ url: 'https://example.com/404', observation: 'same', domSnapshot: dom }),
        makeStep({ url: 'https://example.com/404', observation: 'same', domSnapshot: dom }),
        makeStep({ url: 'https://example.com/404', observation: 'same', domSnapshot: dom }),
      ];
      const result = service.checkStep(steps);
      expect(result.exitReason).toBe('404-detected');
    });
  });
});
