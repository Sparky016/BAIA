/**
 * Typed, discriminated union representing every browser interaction the
 * NL→action planner can emit.  Each variant carries exactly the params its
 * Playwright mapping needs — no loose string bags.
 *
 * Conventions:
 *  - `selector` is a CSS/XPath selector string used by Playwright locators.
 *  - All timeout values are in milliseconds.
 *  - `AssertAction` captures UI assertions (text present, element visible, …).
 *  - `WaitForAction` models explicit waits before the next action.
 */

// ---------------------------------------------------------------------------
// Navigate
// ---------------------------------------------------------------------------

/** Navigate the page to an absolute URL. */
export interface NavigateAction {
  type: 'navigate';
  /** Absolute URL to navigate to (e.g. "https://example.com/login"). */
  url: string;
  /** Optional navigation timeout override in ms. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Click
// ---------------------------------------------------------------------------

/** Click a single element matched by `selector`. */
export interface ClickAction {
  type: 'click';
  /** CSS / XPath selector identifying the target element. */
  selector: string;
  /** Optional interaction timeout override in ms. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Fill
// ---------------------------------------------------------------------------

/** Clear an input / textarea and type `value` into it. */
export interface FillAction {
  type: 'fill';
  /** CSS / XPath selector identifying the input element. */
  selector: string;
  /** Text value to type into the element. */
  value: string;
  /** Optional interaction timeout override in ms. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Select
// ---------------------------------------------------------------------------

/** Choose an option in a <select> element by its visible label or value. */
export interface SelectAction {
  type: 'select';
  /** CSS / XPath selector identifying the <select> element. */
  selector: string;
  /**
   * The option to select.  Playwright's `selectOption` accepts the option's
   * `value` attribute, its visible text, or its `label` attribute — pass
   * whichever the planner has available; the executor tries all three forms.
   */
  option: string;
  /** Optional interaction timeout override in ms. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Assert
// ---------------------------------------------------------------------------

/** Assertion kinds the executor can verify without calling the LLM. */
export type AssertKind =
  | 'visible' // element exists and is visible
  | 'hidden' // element does not exist or is invisible
  | 'text' // element's textContent contains `expected`
  | 'url'; // page URL matches `expected` (substring or exact)

/** Assert a UI condition and capture the result in the action result. */
export interface AssertAction {
  type: 'assert';
  kind: AssertKind;
  /**
   * CSS / XPath selector for element-level assertions (`visible`, `hidden`,
   * `text`).  Not required for `url` assertions.
   */
  selector?: string;
  /**
   * Expected text or URL fragment.  Required for `text` and `url` kinds.
   * Ignored for `visible` / `hidden`.
   */
  expected?: string;
  /** Optional assertion timeout override in ms. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// WaitFor
// ---------------------------------------------------------------------------

/** What to wait for before proceeding. */
export type WaitForKind =
  | 'selector' // wait until a DOM element is present/visible
  | 'navigation' // wait for a top-level navigation to commit
  | 'timeout'; // unconditional sleep (use sparingly)

/** Pause execution until a condition is satisfied. */
export interface WaitForAction {
  type: 'waitFor';
  kind: WaitForKind;
  /**
   * CSS / XPath selector — required when `kind === 'selector'`.
   * Ignored for `navigation` and `timeout`.
   */
  selector?: string;
  /**
   * Duration in ms.
   *  - `selector`: maximum wait time (Playwright default applies if omitted).
   *  - `navigation`: maximum wait time for the navigation to complete.
   *  - `timeout`: exact sleep duration.
   */
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Union
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all action types.
 *
 * The `type` field is the discriminant; switch / if-else narrowing works out
 * of the box with TypeScript's control-flow analysis.
 *
 * @example
 * ```ts
 * function describe(action: Action): string {
 *   switch (action.type) {
 *     case 'navigate': return `go to ${action.url}`;
 *     case 'click':    return `click ${action.selector}`;
 *     // …
 *   }
 * }
 * ```
 */
export type Action =
  | NavigateAction
  | ClickAction
  | FillAction
  | SelectAction
  | AssertAction
  | WaitForAction;
