import {
  Action,
  AssertAction,
  AssertKind,
  ClickAction,
  FillAction,
  NavigateAction,
  SelectAction,
  WaitForAction,
} from '@baia/shared';
import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/**
 * Outcome of executing a single {@link Action} against a Playwright {@link Page}.
 *
 * Failures (selector not found, assertion mismatch, navigation timeout, …) are
 * **always reported as `{ ok: false, error }` — never thrown**.  Only a
 * programming error (bad action object) propagates as an exception.
 */
export interface ActionResult {
  /** `true` when the action completed without error. */
  ok: boolean;
  /**
   * Human-readable error message when `ok === false`.
   * `undefined` on success.
   */
  error?: string;
  /**
   * Human-readable observation about what happened.
   * Present on both success and failure so callers can log progress.
   */
  observation: string;
  /**
   * HTTP response status for navigate actions.
   * `undefined` for non-navigate actions or when navigation failed before receiving a response.
   */
  httpStatus?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Executes a single {@link Action} against an open Playwright {@link Page}.
 *
 * The `Page` is **accepted at call time** (not injected into the constructor)
 * so the service is fully stateless and trivially mockable in tests — just
 * pass a fake `Page` object.
 *
 * Design invariant: **no method throws on Playwright errors**.  Every error
 * surface (timeout, missing selector, failed assertion) is converted to
 * `{ ok: false, error: <message>, observation: <message> }`.
 */
@Injectable()
export class ActionExecutorService {
  private readonly logger = new Logger(ActionExecutorService.name);

  /**
   * Execute `action` against `page` and return a structured result.
   *
   * @param page   An already-open Playwright `Page` (from {@link PlaywrightRunnerService}).
   * @param action The action to execute.
   * @returns      {@link ActionResult} — never throws on Playwright failures.
   */
  async execute(page: Page, action: Action): Promise<ActionResult> {
    this.logger.debug(`Executing action: ${action.type}`);

    switch (action.type) {
      case 'navigate':
        return this.executeNavigate(page, action);
      case 'click':
        return this.executeClick(page, action);
      case 'fill':
        return this.executeFill(page, action);
      case 'select':
        return this.executeSelect(page, action);
      case 'assert':
        return this.executeAssert(page, action);
      case 'waitFor':
        return this.executeWaitFor(page, action);
    }
  }

  // ── Private handlers ──────────────────────────────────────────────────────

  private async executeNavigate(page: Page, action: NavigateAction): Promise<ActionResult> {
    const attempt = async (): Promise<ActionResult> => {
      try {
        const options = action.timeoutMs !== undefined ? { timeout: action.timeoutMs } : {};
        const response = await page.goto(action.url, options);
        const httpStatus = response?.status();
        const finalUrl = page.url();
        const observation = `Navigated to ${finalUrl}`;
        this.logger.log(observation);
        return { ok: true, observation, httpStatus };
      } catch (err) {
        const error = toMessage(err);
        const observation = `Navigation to ${action.url} failed: ${error}`;
        this.logger.warn(observation);
        return { ok: false, error, observation };
      }
    };

    const firstResult = await attempt();
    if (!firstResult.ok && isTransientError(firstResult.error ?? '')) {
      await page.waitForTimeout(1000).catch(() => {});
      const retryResult = await attempt();
      if (retryResult.ok) {
        return { ...retryResult, observation: `${retryResult.observation} (succeeded after retry)` };
      }
    }
    return firstResult;
  }

  private async executeClick(page: Page, action: ClickAction): Promise<ActionResult> {
    const attempt = async (): Promise<ActionResult> => {
      try {
        const options = action.timeoutMs !== undefined ? { timeout: action.timeoutMs } : {};
        await page.click(action.selector, options);
        const observation = `Clicked element matching "${action.selector}"`;
        this.logger.log(observation);
        return { ok: true, observation };
      } catch (err) {
        const error = toMessage(err);
        const observation = `Click on "${action.selector}" failed: ${error}`;
        this.logger.warn(observation);
        return { ok: false, error, observation };
      }
    };

    const firstResult = await attempt();
    if (!firstResult.ok && isTransientError(firstResult.error ?? '')) {
      await page.waitForTimeout(1000).catch(() => {});
      const retryResult = await attempt();
      if (retryResult.ok) {
        return { ...retryResult, observation: `${retryResult.observation} (succeeded after retry)` };
      }
    }
    return firstResult;
  }

  private async executeFill(page: Page, action: FillAction): Promise<ActionResult> {
    try {
      const options = action.timeoutMs !== undefined ? { timeout: action.timeoutMs } : {};
      await page.fill(action.selector, action.value, options);
      const observation = `Filled "${action.selector}" with value`;
      this.logger.log(observation);
      return { ok: true, observation };
    } catch (err) {
      const error = toMessage(err);
      const observation = `Fill on "${action.selector}" failed: ${error}`;
      this.logger.warn(observation);
      return { ok: false, error, observation };
    }
  }

  private async executeSelect(page: Page, action: SelectAction): Promise<ActionResult> {
    try {
      const options = action.timeoutMs !== undefined ? { timeout: action.timeoutMs } : {};
      await page.selectOption(action.selector, action.option, options);
      const observation = `Selected option "${action.option}" in "${action.selector}"`;
      this.logger.log(observation);
      return { ok: true, observation };
    } catch (err) {
      const error = toMessage(err);
      const observation = `Select on "${action.selector}" failed: ${error}`;
      this.logger.warn(observation);
      return { ok: false, error, observation };
    }
  }

  private async executeAssert(page: Page, action: AssertAction): Promise<ActionResult> {
    try {
      return await this.runAssertion(page, action);
    } catch (err) {
      const error = toMessage(err);
      const observation = `Assert (${action.kind}) failed unexpectedly: ${error}`;
      this.logger.warn(observation);
      return { ok: false, error, observation };
    }
  }

  private async runAssertion(page: Page, action: AssertAction): Promise<ActionResult> {
    const kind: AssertKind = action.kind;

    switch (kind) {
      case 'visible': {
        const selector = requireSelector(action);
        const locator = page.locator(selector);
        const count = await locator.count();
        if (count === 0) {
          const error = `Element "${selector}" not found in DOM`;
          return { ok: false, error, observation: error };
        }
        const visible = await locator.first().isVisible();
        if (!visible) {
          const error = `Element "${selector}" exists but is not visible`;
          return { ok: false, error, observation: error };
        }
        const observation = `Element "${selector}" is visible`;
        return { ok: true, observation };
      }

      case 'hidden': {
        const selector = requireSelector(action);
        const locator = page.locator(selector);
        const count = await locator.count();
        if (count > 0) {
          const visible = await locator.first().isVisible();
          if (visible) {
            const error = `Element "${selector}" is visible (expected hidden)`;
            return { ok: false, error, observation: error };
          }
        }
        const observation = `Element "${selector}" is hidden or absent`;
        return { ok: true, observation };
      }

      case 'text': {
        const selector = requireSelector(action);
        const expected = requireExpected(action);
        const locator = page.locator(selector);
        const count = await locator.count();
        if (count === 0) {
          const error = `Element "${selector}" not found — cannot assert text`;
          return { ok: false, error, observation: error };
        }
        const text = await locator.first().textContent();
        if (text === null || !text.includes(expected)) {
          const error = `Element "${selector}" text "${text ?? ''}" does not contain "${expected}"`;
          return { ok: false, error, observation: error };
        }
        const observation = `Element "${selector}" contains expected text "${expected}"`;
        return { ok: true, observation };
      }

      case 'url': {
        const expected = requireExpected(action);
        const currentUrl = page.url();
        if (!currentUrl.includes(expected)) {
          const error = `Current URL "${currentUrl}" does not contain "${expected}"`;
          return { ok: false, error, observation: error };
        }
        const observation = `URL "${currentUrl}" contains "${expected}"`;
        return { ok: true, observation };
      }
    }
  }

  private async executeWaitFor(page: Page, action: WaitForAction): Promise<ActionResult> {
    try {
      switch (action.kind) {
        case 'selector': {
          const selector = requireSelector(action);
          const options = action.durationMs !== undefined ? { timeout: action.durationMs } : {};
          await page.waitForSelector(selector, options);
          const observation = `Waited for selector "${selector}"`;
          this.logger.log(observation);
          return { ok: true, observation };
        }

        case 'navigation': {
          const options = action.durationMs !== undefined ? { timeout: action.durationMs } : {};
          await page.waitForNavigation(options);
          const observation = `Waited for navigation to complete`;
          this.logger.log(observation);
          return { ok: true, observation };
        }

        case 'timeout': {
          const duration = action.durationMs ?? 0;
          await page.waitForTimeout(duration);
          const observation = `Waited ${duration} ms`;
          this.logger.log(observation);
          return { ok: true, observation };
        }
      }
    } catch (err) {
      const error = toMessage(err);
      const observation = `WaitFor (${action.kind}) failed: ${error}`;
      this.logger.warn(observation);
      return { ok: false, error, observation };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Detects transient failures (element not found, timeout) that are worth retrying. */
function isTransientError(error: string): boolean {
  const lower = error.toLowerCase();
  return lower.includes('timeout') || lower.includes('waiting for') || lower.includes('not found');
}

/** Extracts a human-readable message from an unknown thrown value. */
function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/**
 * Asserts that `action.selector` is present; throws a programming-level error
 * (not a result error) when it is missing.  This should never happen if the
 * planner validates actions before emitting them.
 */
function requireSelector(action: AssertAction | WaitForAction): string {
  if (!action.selector) {
    throw new Error(
      `Action type "${action.type}" kind "${action.kind}" requires a selector but none was provided`
    );
  }
  return action.selector;
}

/**
 * Asserts that `action.expected` is present; throws a programming-level error
 * when it is missing.
 */
function requireExpected(action: AssertAction): string {
  if (action.expected === undefined || action.expected === null) {
    throw new Error(
      `Assert action kind "${action.kind}" requires an expected value but none was provided`
    );
  }
  return action.expected;
}
