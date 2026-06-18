import type { Buffer } from 'node:buffer';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Browser, BrowserContext, BrowserType, Page } from 'playwright';

/**
 * Injection token for the Playwright BrowserType (chromium-like launcher).
 * Providing this token makes the launcher swappable in tests without touching
 * the service implementation or importing the real Playwright browser binaries.
 */
export const CHROMIUM_LAUNCHER = 'CHROMIUM_LAUNCHER';

/** Configuration surface exposed to callers and NestJS module wiring. */
export interface PlaywrightRunnerConfig {
  /** Launch browser in headless mode. Defaults to true. */
  headless: boolean;
  /**
   * Default navigation timeout in milliseconds applied to every
   * `page.goto` call via `page.setDefaultNavigationTimeout`.
   * Defaults to 30 000 ms.
   */
  navigationTimeoutMs: number;
}

/** Default configuration values. */
export const DEFAULT_PLAYWRIGHT_CONFIG: PlaywrightRunnerConfig = {
  headless: true,
  navigationTimeoutMs: 30_000,
};

/** Payload returned by {@link PlaywrightRunnerService.captureScreenshot}. */
export interface ScreenshotResult {
  /** Absolute URL of the page that was captured. */
  url: string;
  /**
   * Raw PNG image bytes.  Buffer is chosen over base64 string so the
   * caller can decide on encoding (e.g. base64 for JSON, raw for disk).
   */
  data: Buffer;
}

/**
 * Managed Playwright browser lifecycle service.
 *
 * A single session consists of:
 *   launch -> newContext -> newPage -> [navigate + screenshot]* -> teardown
 *
 * `teardown` is **always** called -- even when an error is thrown during
 * navigation or screenshot -- so browser processes are never leaked.
 *
 * Playwright is injected via `CHROMIUM_LAUNCHER` so unit tests can provide a
 * fully-mocked `BrowserType` without downloading browser binaries.
 */
@Injectable()
export class PlaywrightRunnerService {
  private readonly logger = new Logger(PlaywrightRunnerService.name);
  private readonly config: PlaywrightRunnerConfig;

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(
    @Inject(CHROMIUM_LAUNCHER)
    private readonly launcher: BrowserType,
    config?: Partial<PlaywrightRunnerConfig>
  ) {
    this.config = { ...DEFAULT_PLAYWRIGHT_CONFIG, ...config };
  }

  /**
   * Launches a browser instance, creates a fresh browser context, and opens a
   * new page.  Calling `launch` while already launched is a no-op.
   */
  async launch(): Promise<void> {
    if (this.browser) {
      this.logger.warn(
        'PlaywrightRunnerService.launch() called while already launched -- ignoring'
      );
      return;
    }

    this.logger.log(`Launching browser (headless=${this.config.headless})`);
    this.browser = await this.launcher.launch({ headless: this.config.headless });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
    this.page.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);
    this.logger.log('Browser ready');
  }

  /**
   * Navigates the active page to `url`.
   *
   * @throws {Error} if the service has not been launched yet.
   */
  async navigate(url: string): Promise<void> {
    this.assertReady();
    this.logger.log(`Navigating to ${url}`);
    // Non-null assertion is safe: assertReady() guarantees page is set.
    await this.page!.goto(url);
  }

  /**
   * Captures a full-page PNG screenshot of the current page.
   *
   * @returns {@link ScreenshotResult} with the current URL and raw PNG bytes.
   * @throws {Error} if the service has not been launched yet.
   */
  async captureScreenshot(): Promise<ScreenshotResult> {
    this.assertReady();
    this.logger.log('Capturing screenshot');
    const data = await this.page!.screenshot({ fullPage: true });
    const url = this.page!.url();
    return { url, data };
  }

  /**
   * Closes the page, browser context, and browser in order.
   *
   * Safe to call even if `launch()` was never called or a prior teardown
   * already ran -- extra calls are silently ignored.
   */
  async teardown(): Promise<void> {
    this.logger.log('Tearing down browser session');
    try {
      if (this.page) {
        await this.page.close();
      }
    } catch (err) {
      this.logger.error('Error closing page', err);
    } finally {
      this.page = null;
    }

    try {
      if (this.context) {
        await this.context.close();
      }
    } catch (err) {
      this.logger.error('Error closing context', err);
    } finally {
      this.context = null;
    }

    try {
      if (this.browser) {
        await this.browser.close();
      }
    } catch (err) {
      this.logger.error('Error closing browser', err);
    } finally {
      this.browser = null;
    }

    this.logger.log('Browser session torn down');
  }

  /**
   * Convenience helper that guarantees teardown runs even if `operation`
   * throws.  Use this when you want the caller to handle the error but still
   * need the browser to be cleaned up.
   *
   * ```ts
   * const result = await runner.withTeardown(async () => {
   *   await runner.launch();
   *   await runner.navigate('https://example.com');
   *   return runner.captureScreenshot();
   * });
   * ```
   */
  async withTeardown<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } finally {
      await this.teardown();
    }
  }

  /**
   * Returns the active Playwright `Page`, or `null` if not yet launched.
   * Intended for orchestrators that need to pass the page to other services.
   */
  getPage(): Page | null {
    return this.page;
  }

  // -- internal --------------------------------------------------------------

  private assertReady(): void {
    if (!this.browser || !this.context || !this.page) {
      throw new Error(
        'PlaywrightRunnerService: browser session not started -- call launch() first'
      );
    }
  }
}
