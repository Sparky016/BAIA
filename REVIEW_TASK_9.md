# Task 9 (P2): Accessibility & Remaining UX Polish

## Problem

Beyond the explanatory-copy gaps covered in Task 7, several smaller UX/accessibility issues reduce how self-explanatory and inclusive the UI is:

1. **Color-only provenance indicators with no screen-reader support.** `gherkin-editor.component.html` badges rely on CSS classes/color for provenance distinction with no `aria-label`; a screen reader user hears only the raw badge text ("ui", "code", "merged") with none of the contextual meaning Task 7's legend adds visually.
2. **No `aria-describedby` linking validation errors to their fields.** `input.component.html` associates labels with inputs correctly via `for`/`id`, but the red error text below each field (URL/Instructions validation) isn't linked via `aria-describedby`, so assistive tech won't announce the error in context when the field receives focus.
3. **No focus management on route change.** Navigating progress → review (`progress.component.ts` around the auto-navigate-on-review-state logic) doesn't move keyboard focus to the new page's main content; focus likely remains on/near a now-removed element, breaking the keyboard navigation flow.
4. **Export/API error messages have no retry affordance.** `export-panel.component.ts` shows `error.message ?? 'Export failed'` with no retry button — the user must manually re-click the original action, which isn't obviously the right recovery step from the message alone.
5. **Fixed 30s Playwright timeouts applied uniformly** (`playwright-runner.service.ts`) regardless of target-site responsiveness, and a full-page screenshot captured on every single step regardless of whether the page visibly changed — both add avoidable latency to the explore loop (related to, but lower-severity than, Task 3's core reliability fixes).

## Implementation Notes

1. **Add `aria-label`s to provenance badges** describing the full meaning (e.g. `aria-label="Provenance: observed in the live browser"` for `ui`), independent of Task 7's visual legend — both should exist, since sighted keyboard users benefit from the legend and screen-reader users need the per-badge label regardless of whether they discover the legend.
2. **Wire `aria-describedby`** from each form field to its error message element's `id` in `input.component.html`, conditionally present only when the error is shown (matching Angular's existing `*ngIf` pattern for the error text).
3. **Add explicit focus management** on the progress→review (and input→progress) transitions: after navigation, programmatically focus the new page's `<h1>`/main heading (a common, simple, effective pattern — add `tabindex="-1"` to the heading and call `.focus()` in the component's `ngAfterViewInit` or on the router navigation event).
4. **Add a retry affordance to export/API errors** — a "Try again" button next to the error message that re-invokes the last action, rather than requiring the user to scroll back up and re-click the original button.
5. **Investigate adaptive timeouts / conditional screenshotting** in `playwright-runner.service.ts` as a lower-priority performance improvement once Task 3's reliability work lands — e.g. skip re-capturing a full-page screenshot if the DOM hash is unchanged from the previous step (ties into Task 3's structural repeat-detection work, which will already compute a DOM fingerprint that could be reused here).

## Acceptance Criteria

- [ ] Provenance badges have descriptive `aria-label`s independent of any visual legend.
- [ ] Form validation errors are linked to their fields via `aria-describedby` and announced by screen readers on focus.
- [ ] Keyboard focus moves to the new page's main heading after each route transition in the pipeline flow.
- [ ] Export/API error states include a "Try again" action.
- [ ] (Stretch) Screenshot capture is skipped when the page state is unchanged from the previous step, reducing avoidable latency.
- [ ] Manual keyboard-only and screen-reader smoke test (e.g. VoiceOver/NVDA + Tab-only navigation) through Input → Progress → Review confirms no dead ends or unannounced state changes.

## Affected Files

- `baia-ui/src/app/review/gherkin-editor.component.html`
- `baia-ui/src/app/input/input.component.html`
- `baia-ui/src/app/progress/progress.component.ts`, `review/review.component.ts` (focus management)
- `baia-ui/src/app/review/export-panel.component.ts/.html` (retry affordance)
- `baia-server/src/explore/playwright-runner.service.ts` (stretch: conditional screenshotting)
