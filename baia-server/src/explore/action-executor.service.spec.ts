import {
  Action,
  AssertAction,
  ClickAction,
  FillAction,
  NavigateAction,
  SelectAction,
  WaitForAction,
} from '@baia/shared';

import { ActionExecutorService, ActionResult } from './action-executor.service';

// ---------------------------------------------------------------------------
// Fake Page helpers
// ---------------------------------------------------------------------------

/**
 * Minimal fake of the Playwright Locator interface — only the surface used by
 * ActionExecutorService.
 */
function makeFakeLocator(overrides: {
  count?: number;
  isVisible?: boolean;
  textContent?: string | null;
}): {
  count: jest.Mock;
  first: jest.Mock;
  isVisible: jest.Mock;
  textContent: jest.Mock;
} {
  const inner = {
    isVisible: jest.fn().mockResolvedValue(overrides.isVisible ?? true),
    textContent: jest.fn().mockResolvedValue(overrides.textContent ?? null),
  };
  return {
    count: jest.fn().mockResolvedValue(overrides.count ?? 1),
    first: jest.fn().mockReturnValue(inner),
    isVisible: inner.isVisible,
    textContent: inner.textContent,
  };
}

type FakeLocator = ReturnType<typeof makeFakeLocator>;

/**
 * Minimal fake of the Playwright Page interface — only the surface used by
 * ActionExecutorService.
 */
function makeFakePage(urlValue = 'https://example.com'): {
  goto: jest.Mock;
  click: jest.Mock;
  fill: jest.Mock;
  selectOption: jest.Mock;
  locator: jest.Mock;
  waitForSelector: jest.Mock;
  waitForNavigation: jest.Mock;
  waitForTimeout: jest.Mock;
  url: jest.Mock;
  _locatorStore: Map<string, FakeLocator>;
  /** Helper: pre-register a locator for a given selector. */
  setLocator: (selector: string, locator: FakeLocator) => void;
} {
  const locatorStore = new Map<string, FakeLocator>();

  const page = {
    goto: jest.fn().mockResolvedValue(null),
    click: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
    selectOption: jest.fn().mockResolvedValue(['value']),
    locator: jest.fn((selector: string) => {
      const existing = locatorStore.get(selector);
      if (existing) return existing;
      // Default: element exists and is visible
      const def = makeFakeLocator({ count: 1, isVisible: true, textContent: 'default text' });
      locatorStore.set(selector, def);
      return def;
    }),
    waitForSelector: jest.fn().mockResolvedValue(null),
    waitForNavigation: jest.fn().mockResolvedValue(null),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    url: jest.fn().mockReturnValue(urlValue),
    _locatorStore: locatorStore,
    setLocator(selector: string, locator: FakeLocator): void {
      locatorStore.set(selector, locator);
    },
  };

  return page;
}

type FakePage = ReturnType<typeof makeFakePage>;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('ActionExecutorService', () => {
  let service: ActionExecutorService;
  let page: FakePage;

  beforeEach(() => {
    service = new ActionExecutorService();
    page = makeFakePage();
  });

  // ── navigate ─────────────────────────────────────────────────────────────

  describe('navigate', () => {
    it('calls page.goto with the given URL and returns ok:true', async () => {
      const action: NavigateAction = { type: 'navigate', url: 'https://target.example.com' };
      const result: ActionResult = await service.execute(page as never, action);

      expect(page.goto).toHaveBeenCalledWith('https://target.example.com', {});
      expect(result.ok).toBe(true);
      expect(result.observation).toContain('Navigated');
    });

    it('passes timeout option when timeoutMs is set', async () => {
      const action: NavigateAction = {
        type: 'navigate',
        url: 'https://target.example.com',
        timeoutMs: 5000,
      };
      await service.execute(page as never, action);
      expect(page.goto).toHaveBeenCalledWith('https://target.example.com', { timeout: 5000 });
    });

    it('returns ok:false with error message when goto throws', async () => {
      page.goto.mockRejectedValue(new Error('Navigation timeout'));
      const action: NavigateAction = { type: 'navigate', url: 'https://bad.example.com' };
      const result = await service.execute(page as never, action);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Navigation timeout');
      expect(result.observation).toContain('failed');
    });

    it('does not throw when goto rejects', async () => {
      page.goto.mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED'));
      const action: NavigateAction = { type: 'navigate', url: 'https://nowhere.invalid' };
      await expect(service.execute(page as never, action)).resolves.not.toThrow();
    });
  });

  // ── click ─────────────────────────────────────────────────────────────────

  describe('click', () => {
    it('calls page.click with selector and returns ok:true', async () => {
      const action: ClickAction = { type: 'click', selector: '#submit-btn' };
      const result = await service.execute(page as never, action);

      expect(page.click).toHaveBeenCalledWith('#submit-btn', {});
      expect(result.ok).toBe(true);
      expect(result.observation).toContain('#submit-btn');
    });

    it('passes timeout option when timeoutMs is set', async () => {
      const action: ClickAction = { type: 'click', selector: 'button', timeoutMs: 3000 };
      await service.execute(page as never, action);
      expect(page.click).toHaveBeenCalledWith('button', { timeout: 3000 });
    });

    it('returns ok:false when click throws (element not found)', async () => {
      page.click.mockRejectedValue(new Error('No element found for selector'));
      const action: ClickAction = { type: 'click', selector: '#missing' };
      const result = await service.execute(page as never, action);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('No element found');
      expect(result.observation).toContain('failed');
    });

    it('does not throw when click rejects', async () => {
      page.click.mockRejectedValue(new Error('Timeout'));
      const action: ClickAction = { type: 'click', selector: '#btn' };
      await expect(service.execute(page as never, action)).resolves.not.toThrow();
    });
  });

  // ── fill ──────────────────────────────────────────────────────────────────

  describe('fill', () => {
    it('calls page.fill with selector and value, returns ok:true', async () => {
      const action: FillAction = { type: 'fill', selector: '#username', value: 'alice' };
      const result = await service.execute(page as never, action);

      expect(page.fill).toHaveBeenCalledWith('#username', 'alice', {});
      expect(result.ok).toBe(true);
      expect(result.observation).toContain('#username');
    });

    it('passes timeout option when timeoutMs is set', async () => {
      const action: FillAction = {
        type: 'fill',
        selector: '#email',
        value: 'a@b.com',
        timeoutMs: 2000,
      };
      await service.execute(page as never, action);
      expect(page.fill).toHaveBeenCalledWith('#email', 'a@b.com', { timeout: 2000 });
    });

    it('returns ok:false when fill throws', async () => {
      page.fill.mockRejectedValue(new Error('Element is not an input'));
      const action: FillAction = { type: 'fill', selector: 'div', value: 'text' };
      const result = await service.execute(page as never, action);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Element is not an input');
    });

    it('does not throw when fill rejects', async () => {
      page.fill.mockRejectedValue(new Error('Timeout'));
      const action: FillAction = { type: 'fill', selector: '#f', value: 'v' };
      await expect(service.execute(page as never, action)).resolves.not.toThrow();
    });
  });

  // ── select ────────────────────────────────────────────────────────────────

  describe('select', () => {
    it('calls page.selectOption with selector and option, returns ok:true', async () => {
      const action: SelectAction = {
        type: 'select',
        selector: '#country',
        option: 'South Africa',
      };
      const result = await service.execute(page as never, action);

      expect(page.selectOption).toHaveBeenCalledWith('#country', 'South Africa', {});
      expect(result.ok).toBe(true);
      expect(result.observation).toContain('South Africa');
    });

    it('passes timeout option when timeoutMs is set', async () => {
      const action: SelectAction = {
        type: 'select',
        selector: '#lang',
        option: 'en',
        timeoutMs: 4000,
      };
      await service.execute(page as never, action);
      expect(page.selectOption).toHaveBeenCalledWith('#lang', 'en', { timeout: 4000 });
    });

    it('returns ok:false when selectOption throws', async () => {
      page.selectOption.mockRejectedValue(new Error('Option not found'));
      const action: SelectAction = { type: 'select', selector: '#s', option: 'missing' };
      const result = await service.execute(page as never, action);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Option not found');
    });

    it('does not throw when selectOption rejects', async () => {
      page.selectOption.mockRejectedValue(new Error('Timeout'));
      const action: SelectAction = { type: 'select', selector: '#s', option: 'x' };
      await expect(service.execute(page as never, action)).resolves.not.toThrow();
    });
  });

  // ── assert ────────────────────────────────────────────────────────────────

  describe('assert', () => {
    describe('kind: visible', () => {
      it('returns ok:true when element is found and visible', async () => {
        const locator = makeFakeLocator({ count: 1, isVisible: true });
        page.setLocator('#hero', locator);

        const action: AssertAction = { type: 'assert', kind: 'visible', selector: '#hero' };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(true);
        expect(result.observation).toContain('visible');
      });

      it('returns ok:false when element is not found', async () => {
        const locator = makeFakeLocator({ count: 0 });
        page.setLocator('#ghost', locator);

        const action: AssertAction = { type: 'assert', kind: 'visible', selector: '#ghost' };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(false);
        expect(result.error).toContain('not found');
      });

      it('returns ok:false when element exists but is not visible', async () => {
        const locator = makeFakeLocator({ count: 1, isVisible: false });
        page.setLocator('#hidden-el', locator);

        const action: AssertAction = { type: 'assert', kind: 'visible', selector: '#hidden-el' };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(false);
        expect(result.error).toContain('not visible');
      });

      it('does not throw when locator.count() rejects', async () => {
        page.locator.mockReturnValue({
          count: jest.fn().mockRejectedValue(new Error('DOM error')),
          first: jest.fn(),
        });
        const action: AssertAction = { type: 'assert', kind: 'visible', selector: '#x' };
        await expect(service.execute(page as never, action)).resolves.not.toThrow();
        const result = await service.execute(page as never, action);
        expect(result.ok).toBe(false);
      });
    });

    describe('kind: hidden', () => {
      it('returns ok:true when element is absent', async () => {
        const locator = makeFakeLocator({ count: 0 });
        page.setLocator('#absent', locator);

        const action: AssertAction = { type: 'assert', kind: 'hidden', selector: '#absent' };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(true);
        expect(result.observation).toContain('hidden or absent');
      });

      it('returns ok:true when element exists but is not visible', async () => {
        const locator = makeFakeLocator({ count: 1, isVisible: false });
        page.setLocator('#offscreen', locator);

        const action: AssertAction = { type: 'assert', kind: 'hidden', selector: '#offscreen' };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(true);
      });

      it('returns ok:false when element exists and is visible', async () => {
        const locator = makeFakeLocator({ count: 1, isVisible: true });
        page.setLocator('#visible-el', locator);

        const action: AssertAction = { type: 'assert', kind: 'hidden', selector: '#visible-el' };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(false);
        expect(result.error).toContain('visible (expected hidden)');
      });
    });

    describe('kind: text', () => {
      it('returns ok:true when element text contains expected string', async () => {
        const locator = makeFakeLocator({ count: 1, isVisible: true, textContent: 'Hello World' });
        page.setLocator('h1', locator);

        const action: AssertAction = {
          type: 'assert',
          kind: 'text',
          selector: 'h1',
          expected: 'Hello',
        };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(true);
        expect(result.observation).toContain('Hello');
      });

      it('returns ok:false when element text does not contain expected', async () => {
        const locator = makeFakeLocator({ count: 1, textContent: 'Goodbye World' });
        page.setLocator('h1', locator);

        const action: AssertAction = {
          type: 'assert',
          kind: 'text',
          selector: 'h1',
          expected: 'Hello',
        };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(false);
        expect(result.error).toContain('does not contain');
      });

      it('returns ok:false when element is not found', async () => {
        const locator = makeFakeLocator({ count: 0 });
        page.setLocator('h2', locator);

        const action: AssertAction = {
          type: 'assert',
          kind: 'text',
          selector: 'h2',
          expected: 'anything',
        };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(false);
        expect(result.error).toContain('not found');
      });

      it('returns ok:false when textContent is null', async () => {
        const locator = makeFakeLocator({ count: 1, textContent: null });
        page.setLocator('p', locator);

        const action: AssertAction = {
          type: 'assert',
          kind: 'text',
          selector: 'p',
          expected: 'text',
        };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(false);
      });
    });

    describe('kind: url', () => {
      it('returns ok:true when page URL contains expected fragment', async () => {
        page.url.mockReturnValue('https://example.com/dashboard?tab=home');

        const action: AssertAction = {
          type: 'assert',
          kind: 'url',
          expected: 'dashboard',
        };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(true);
        expect(result.observation).toContain('dashboard');
      });

      it('returns ok:false when page URL does not contain expected fragment', async () => {
        page.url.mockReturnValue('https://example.com/login');

        const action: AssertAction = {
          type: 'assert',
          kind: 'url',
          expected: 'dashboard',
        };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(false);
        expect(result.error).toContain('does not contain');
      });
    });

    describe('assert — missing required fields (programming errors)', () => {
      it('returns ok:false when visible assert is missing selector', async () => {
        const action = { type: 'assert', kind: 'visible' } as AssertAction;
        const result = await service.execute(page as never, action);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('selector');
      });

      it('returns ok:false when text assert is missing expected', async () => {
        const locator = makeFakeLocator({ count: 1, textContent: 'hello' });
        page.setLocator('#el', locator);
        const action = { type: 'assert', kind: 'text', selector: '#el' } as AssertAction;
        const result = await service.execute(page as never, action);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('expected value');
      });

      it('returns ok:false when url assert is missing expected', async () => {
        const action = { type: 'assert', kind: 'url' } as AssertAction;
        const result = await service.execute(page as never, action);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('expected value');
      });
    });
  });

  // ── waitFor ───────────────────────────────────────────────────────────────

  describe('waitFor', () => {
    describe('kind: selector', () => {
      it('calls page.waitForSelector with selector and returns ok:true', async () => {
        const action: WaitForAction = {
          type: 'waitFor',
          kind: 'selector',
          selector: '.loaded',
        };
        const result = await service.execute(page as never, action);

        expect(page.waitForSelector).toHaveBeenCalledWith('.loaded', {});
        expect(result.ok).toBe(true);
        expect(result.observation).toContain('.loaded');
      });

      it('passes timeout when durationMs is set', async () => {
        const action: WaitForAction = {
          type: 'waitFor',
          kind: 'selector',
          selector: '.ready',
          durationMs: 8000,
        };
        await service.execute(page as never, action);
        expect(page.waitForSelector).toHaveBeenCalledWith('.ready', { timeout: 8000 });
      });

      it('returns ok:false when waitForSelector times out', async () => {
        page.waitForSelector.mockRejectedValue(new Error('Timeout waiting for selector'));
        const action: WaitForAction = {
          type: 'waitFor',
          kind: 'selector',
          selector: '.never-appears',
        };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(false);
        expect(result.error).toContain('Timeout waiting for selector');
      });

      it('does not throw when waitForSelector rejects', async () => {
        page.waitForSelector.mockRejectedValue(new Error('Timeout'));
        const action: WaitForAction = {
          type: 'waitFor',
          kind: 'selector',
          selector: '#x',
        };
        await expect(service.execute(page as never, action)).resolves.not.toThrow();
      });

      it('returns ok:false when selector kind is missing selector', async () => {
        const action = { type: 'waitFor', kind: 'selector' } as WaitForAction;
        const result = await service.execute(page as never, action);
        expect(result.ok).toBe(false);
        expect(result.error).toContain('selector');
      });
    });

    describe('kind: navigation', () => {
      it('calls page.waitForNavigation and returns ok:true', async () => {
        const action: WaitForAction = { type: 'waitFor', kind: 'navigation' };
        const result = await service.execute(page as never, action);

        expect(page.waitForNavigation).toHaveBeenCalledWith({});
        expect(result.ok).toBe(true);
        expect(result.observation).toContain('navigation');
      });

      it('passes timeout when durationMs is set', async () => {
        const action: WaitForAction = {
          type: 'waitFor',
          kind: 'navigation',
          durationMs: 6000,
        };
        await service.execute(page as never, action);
        expect(page.waitForNavigation).toHaveBeenCalledWith({ timeout: 6000 });
      });

      it('returns ok:false when waitForNavigation times out', async () => {
        page.waitForNavigation.mockRejectedValue(new Error('Navigation timeout'));
        const action: WaitForAction = { type: 'waitFor', kind: 'navigation' };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(false);
        expect(result.error).toContain('Navigation timeout');
      });
    });

    describe('kind: timeout', () => {
      it('calls page.waitForTimeout with durationMs and returns ok:true', async () => {
        const action: WaitForAction = { type: 'waitFor', kind: 'timeout', durationMs: 500 };
        const result = await service.execute(page as never, action);

        expect(page.waitForTimeout).toHaveBeenCalledWith(500);
        expect(result.ok).toBe(true);
        expect(result.observation).toContain('500');
      });

      it('defaults to 0 ms when durationMs is omitted', async () => {
        const action: WaitForAction = { type: 'waitFor', kind: 'timeout' };
        await service.execute(page as never, action);
        expect(page.waitForTimeout).toHaveBeenCalledWith(0);
      });

      it('returns ok:false when waitForTimeout rejects', async () => {
        page.waitForTimeout.mockRejectedValue(new Error('Interrupted'));
        const action: WaitForAction = { type: 'waitFor', kind: 'timeout', durationMs: 100 };
        const result = await service.execute(page as never, action);

        expect(result.ok).toBe(false);
        expect(result.error).toContain('Interrupted');
      });
    });
  });

  // ── retry logic ───────────────────────────────────────────────────────────

  describe('retry logic', () => {
    it('retries a timed-out click once before returning failure', async () => {
      // First call throws a timeout, second call succeeds
      page.click
        .mockRejectedValueOnce(new Error('Timeout waiting for element'))
        .mockResolvedValueOnce(undefined);

      const action: ClickAction = { type: 'click', selector: '#btn' };
      const result = await service.execute(page as never, action);

      expect(page.click).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(true);
      expect(result.observation).toContain('succeeded after retry');
    });

    it('returns failure after retry if second attempt also fails', async () => {
      page.click
        .mockRejectedValueOnce(new Error('Timeout waiting for element'))
        .mockRejectedValueOnce(new Error('Timeout waiting for element'));

      const action: ClickAction = { type: 'click', selector: '#btn' };
      const result = await service.execute(page as never, action);

      expect(page.click).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(false);
    });

    it('does NOT retry on non-transient errors', async () => {
      page.click.mockRejectedValueOnce(new Error('Some other error'));

      const action: ClickAction = { type: 'click', selector: '#btn' };
      const result = await service.execute(page as never, action);

      expect(page.click).toHaveBeenCalledTimes(1);
      expect(result.ok).toBe(false);
    });

    it('retries a timed-out navigate once and returns success', async () => {
      page.goto
        .mockRejectedValueOnce(new Error('Navigation timeout'))
        .mockResolvedValueOnce({ status: () => 200 } as never);

      const action: NavigateAction = { type: 'navigate', url: 'https://example.com' };
      const result = await service.execute(page as never, action);

      expect(page.goto).toHaveBeenCalledTimes(2);
      expect(result.ok).toBe(true);
      expect(result.observation).toContain('succeeded after retry');
    });
  });

  // ── general invariants ────────────────────────────────────────────────────

  describe('general invariants', () => {
    it('every action result has an observation string', async () => {
      const actions: Action[] = [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'click', selector: 'button' },
        { type: 'fill', selector: 'input', value: 'text' },
        { type: 'select', selector: 'select', option: 'opt' },
        { type: 'assert', kind: 'visible', selector: 'div' },
        { type: 'assert', kind: 'url', expected: 'example' },
        { type: 'waitFor', kind: 'timeout', durationMs: 0 },
      ];

      for (const action of actions) {
        const result = await service.execute(page as never, action);
        expect(typeof result.observation).toBe('string');
        expect(result.observation.length).toBeGreaterThan(0);
      }
    });

    it('failures are always reported as ok:false with error set', async () => {
      const failError = new Error('Hard failure');
      page.goto.mockRejectedValue(failError);
      page.click.mockRejectedValue(failError);
      page.fill.mockRejectedValue(failError);
      page.selectOption.mockRejectedValue(failError);
      page.waitForSelector.mockRejectedValue(failError);
      page.waitForNavigation.mockRejectedValue(failError);
      page.waitForTimeout.mockRejectedValue(failError);

      const actions: Action[] = [
        { type: 'navigate', url: 'https://broken.example.com' },
        { type: 'click', selector: '#missing' },
        { type: 'fill', selector: '#missing', value: 'x' },
        { type: 'select', selector: '#missing', option: 'x' },
        { type: 'waitFor', kind: 'selector', selector: '#missing' },
        { type: 'waitFor', kind: 'navigation' },
        { type: 'waitFor', kind: 'timeout', durationMs: 1 },
      ];

      for (const action of actions) {
        const result = await service.execute(page as never, action);
        expect(result.ok).toBe(false);
        expect(typeof result.error).toBe('string');
      }
    });

    it('success results have ok:true and no error field', async () => {
      const locator = makeFakeLocator({ count: 1, isVisible: true, textContent: 'Welcome' });
      page.setLocator('h1', locator);
      page.url.mockReturnValue('https://example.com/home');

      const successActions: Action[] = [
        { type: 'navigate', url: 'https://example.com' },
        { type: 'click', selector: 'button' },
        { type: 'fill', selector: 'input', value: 'hello' },
        { type: 'select', selector: 'select', option: 'opt' },
        { type: 'assert', kind: 'visible', selector: 'h1' },
        { type: 'assert', kind: 'text', selector: 'h1', expected: 'Welcome' },
        { type: 'assert', kind: 'url', expected: 'example' },
        { type: 'waitFor', kind: 'timeout', durationMs: 0 },
        { type: 'waitFor', kind: 'navigation' },
        { type: 'waitFor', kind: 'selector', selector: 'h1' },
      ];

      for (const action of successActions) {
        const result = await service.execute(page as never, action);
        expect(result.ok).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });
  });
});
