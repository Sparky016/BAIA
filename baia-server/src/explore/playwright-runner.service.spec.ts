import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  CHROMIUM_LAUNCHER,
  DEFAULT_PLAYWRIGHT_CONFIG,
  PlaywrightRunnerConfig,
  PlaywrightRunnerService,
  ScreenshotResult,
} from './playwright-runner.service';

// ── Fake Playwright objects ────────────────────────────────────────────────

/**
 * Fake Page — minimal surface the service uses.
 * Using `jest.fn()` per method so tests can assert call counts and arguments.
 */
function makeFakePage(overrides: Partial<Record<string, jest.Mock>> = {}): {
  goto: jest.Mock;
  screenshot: jest.Mock;
  url: jest.Mock;
  close: jest.Mock;
  setDefaultNavigationTimeout: jest.Mock;
} {
  return {
    goto: jest.fn().mockResolvedValue(null),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('PNG')),
    url: jest.fn().mockReturnValue('https://example.com'),
    close: jest.fn().mockResolvedValue(undefined),
    setDefaultNavigationTimeout: jest.fn(),
    ...overrides,
  };
}

function makeFakeContext(page: ReturnType<typeof makeFakePage>): {
  newPage: jest.Mock;
  close: jest.Mock;
} {
  return {
    newPage: jest.fn().mockResolvedValue(page),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function makeFakeBrowser(context: ReturnType<typeof makeFakeContext>): {
  newContext: jest.Mock;
  close: jest.Mock;
} {
  return {
    newContext: jest.fn().mockResolvedValue(context),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function makeFakeLauncher(browser: ReturnType<typeof makeFakeBrowser>): {
  launch: jest.Mock;
} {
  return {
    launch: jest.fn().mockResolvedValue(browser),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

interface TestBed {
  service: PlaywrightRunnerService;
  launcher: ReturnType<typeof makeFakeLauncher>;
  browser: ReturnType<typeof makeFakeBrowser>;
  context: ReturnType<typeof makeFakeContext>;
  page: ReturnType<typeof makeFakePage>;
}

async function buildTestBed(config?: Partial<PlaywrightRunnerConfig>): Promise<TestBed> {
  const page = makeFakePage();
  const context = makeFakeContext(page);
  const browser = makeFakeBrowser(context);
  const launcher = makeFakeLauncher(browser);

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      {
        provide: CHROMIUM_LAUNCHER,
        useValue: launcher,
      },
      {
        provide: PlaywrightRunnerService,
        useFactory: () => new PlaywrightRunnerService(launcher as never, config),
      },
    ],
  }).compile();

  const service = module.get<PlaywrightRunnerService>(PlaywrightRunnerService);
  return { service, launcher, browser, context, page };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('PlaywrightRunnerService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  describe('DEFAULT_PLAYWRIGHT_CONFIG', () => {
    it('should default to headless=true and 30 000 ms navigation timeout', () => {
      expect(DEFAULT_PLAYWRIGHT_CONFIG.headless).toBe(true);
      expect(DEFAULT_PLAYWRIGHT_CONFIG.navigationTimeoutMs).toBe(30_000);
    });
  });

  describe('launch()', () => {
    it('should call launcher.launch with the configured headless option', async () => {
      const { service, launcher } = await buildTestBed({ headless: false });
      await service.launch();
      expect(launcher.launch).toHaveBeenCalledTimes(1);
      expect(launcher.launch).toHaveBeenCalledWith({ headless: false });
    });

    it('should create a browser context and open a page', async () => {
      const { service, browser, context } = await buildTestBed();
      await service.launch();
      expect(browser.newContext).toHaveBeenCalledTimes(1);
      expect(context.newPage).toHaveBeenCalledTimes(1);
    });

    it('should apply the configured navigation timeout to the page', async () => {
      const { service, page } = await buildTestBed({ navigationTimeoutMs: 10_000 });
      await service.launch();
      expect(page.setDefaultNavigationTimeout).toHaveBeenCalledWith(10_000);
    });

    it('should be idempotent — second call is a no-op', async () => {
      const { service, launcher } = await buildTestBed();
      await service.launch();
      await service.launch(); // second call — should not re-launch
      expect(launcher.launch).toHaveBeenCalledTimes(1);
    });
  });

  describe('navigate()', () => {
    it('should call page.goto with the given URL', async () => {
      const { service, page } = await buildTestBed();
      await service.launch();
      await service.navigate('https://example.com/path');
      expect(page.goto).toHaveBeenCalledWith('https://example.com/path');
    });

    it('should throw when called before launch()', async () => {
      const { service } = await buildTestBed();
      await expect(service.navigate('https://example.com')).rejects.toThrow(
        'browser session not started'
      );
    });
  });

  describe('captureScreenshot()', () => {
    it('should return the current URL and raw PNG bytes', async () => {
      const { service, page } = await buildTestBed();
      page.url.mockReturnValue('https://example.com/captured');
      page.screenshot.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG header

      await service.launch();
      const result: ScreenshotResult = await service.captureScreenshot();

      expect(result.url).toBe('https://example.com/captured');
      expect(Buffer.isBuffer(result.data)).toBe(true);
      expect(result.data[0]).toBe(0x89); // PNG magic byte
    });

    it('should call page.screenshot with fullPage: true', async () => {
      const { service, page } = await buildTestBed();
      await service.launch();
      await service.captureScreenshot();
      expect(page.screenshot).toHaveBeenCalledWith({ fullPage: true });
    });

    it('should throw when called before launch()', async () => {
      const { service } = await buildTestBed();
      await expect(service.captureScreenshot()).rejects.toThrow('browser session not started');
    });
  });

  describe('teardown()', () => {
    it('should close page, context, and browser in order', async () => {
      const { service, page, context, browser } = await buildTestBed();
      await service.launch();

      const callOrder: string[] = [];
      page.close.mockImplementation(async () => {
        callOrder.push('page');
      });
      context.close.mockImplementation(async () => {
        callOrder.push('context');
      });
      browser.close.mockImplementation(async () => {
        callOrder.push('browser');
      });

      await service.teardown();

      expect(callOrder).toEqual(['page', 'context', 'browser']);
    });

    it('should be safe to call without launch() — no error thrown', async () => {
      const { service } = await buildTestBed();
      await expect(service.teardown()).resolves.not.toThrow();
    });

    it('should be safe to call multiple times', async () => {
      const { service } = await buildTestBed();
      await service.launch();
      await service.teardown();
      await expect(service.teardown()).resolves.not.toThrow();
    });

    it('should still close browser and context even when page.close() throws', async () => {
      const { service, page, context, browser } = await buildTestBed();
      await service.launch();
      page.close.mockRejectedValue(new Error('page close failed'));

      await service.teardown(); // must not throw

      expect(context.close).toHaveBeenCalledTimes(1);
      expect(browser.close).toHaveBeenCalledTimes(1);
    });

    it('should still close browser even when context.close() throws', async () => {
      const { service, context, browser } = await buildTestBed();
      await service.launch();
      context.close.mockRejectedValue(new Error('context close failed'));

      await service.teardown(); // must not throw

      expect(browser.close).toHaveBeenCalledTimes(1);
    });

    it('should not throw when browser.close() throws', async () => {
      const { service, browser } = await buildTestBed();
      await service.launch();
      browser.close.mockRejectedValue(new Error('browser close failed'));

      await expect(service.teardown()).resolves.not.toThrow();
    });
  });

  describe('withTeardown()', () => {
    it('should execute the operation and call teardown after success', async () => {
      const { service, browser, page } = await buildTestBed();
      await service.launch();
      page.url.mockReturnValue('https://example.com');

      let operationCalled = false;
      await service.withTeardown(async () => {
        operationCalled = true;
        return 'done';
      });

      expect(operationCalled).toBe(true);
      expect(browser.close).toHaveBeenCalledTimes(1);
    });

    it('should call teardown even when the operation throws', async () => {
      const { service, browser } = await buildTestBed();
      await service.launch();

      await expect(
        service.withTeardown(async () => {
          throw new Error('operation failed');
        })
      ).rejects.toThrow('operation failed');

      // teardown must have run despite the error
      expect(browser.close).toHaveBeenCalledTimes(1);
    });

    it('should return the value produced by the operation', async () => {
      const { service } = await buildTestBed();
      await service.launch();

      const result = await service.withTeardown(async () => 42);
      expect(result).toBe(42);
    });
  });

  describe('full lifecycle: launch → navigate → screenshot → teardown', () => {
    it('should complete the full lifecycle without errors', async () => {
      const { service, launcher, page, context, browser } = await buildTestBed();

      await service.launch();
      await service.navigate('https://example.com');
      const screenshot = await service.captureScreenshot();
      await service.teardown();

      // Launch chain
      expect(launcher.launch).toHaveBeenCalledTimes(1);
      // Navigate
      expect(page.goto).toHaveBeenCalledWith('https://example.com');
      // Screenshot
      expect(page.screenshot).toHaveBeenCalledTimes(1);
      expect(screenshot).toHaveProperty('url');
      expect(screenshot).toHaveProperty('data');
      // Teardown
      expect(page.close).toHaveBeenCalledTimes(1);
      expect(context.close).toHaveBeenCalledTimes(1);
      expect(browser.close).toHaveBeenCalledTimes(1);
    });

    it('teardown runs even when navigate() throws', async () => {
      const { service, page, browser } = await buildTestBed();
      page.goto.mockRejectedValue(new Error('Navigation timeout'));

      await service.launch();

      await expect(
        service.withTeardown(async () => {
          await service.navigate('https://broken.example.com');
        })
      ).rejects.toThrow('Navigation timeout');

      expect(browser.close).toHaveBeenCalledTimes(1);
    });

    it('teardown runs even when captureScreenshot() throws', async () => {
      const { service, page, browser } = await buildTestBed();
      page.screenshot.mockRejectedValue(new Error('Screenshot failed'));

      await service.launch();

      await expect(
        service.withTeardown(async () => {
          await service.navigate('https://example.com');
          await service.captureScreenshot();
        })
      ).rejects.toThrow('Screenshot failed');

      expect(browser.close).toHaveBeenCalledTimes(1);
    });
  });
});
