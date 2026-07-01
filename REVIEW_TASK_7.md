# Task 7 (P1): Make the UI Self-Explanatory (Legend, Copy, Styling, Breadcrumb)

## Problem

Reviewer concern #4: "the UI is user friendly and self explanatory to use." The structural pieces exist (phase stepper, event log, provenance badges) but explanatory copy is missing in the exact places a first-time, non-technical user needs it most:

1. **Provenance badges have no legend anywhere.** `gherkin-editor.component.html` renders `ui`/`code`/`merged` badges (plus conflict warnings) with color/label only — nothing in the app explains what these mean, despite this being central to the product's value proposition (reconciling UI behavior with code-derived rules).
2. **Disabled export fields/buttons have no explanation.** `export-panel.component.html` disables the Confluence fields and both download buttons until the run is approved, but no copy anywhere says "Approve the Gherkin above to enable export" — a user just sees grayed-out controls.
3. **The Instructions textarea gives the least guidance for the most important input.** `input.component.html:24-29` is a blank box with a generic placeholder and no worked example, despite the PRD explicitly calling for "detailed behavioral instructions" as natural language (e.g. *"Click 'Start quote', enter details, navigate to success page"*) — that exact PRD example would make an excellent placeholder/help text.
4. **The Repository (optional) section is unstyled.** `input.component.html:41` wraps it in a bare `<details>` with no matching CSS rule anywhere in `styles.css` — it renders with the browser's default disclosure triangle, visually inconsistent with the rest of the styled UI (per `STYLE_GUIDE.md`), and looks unfinished/broken.
5. **No persistent step indicator across routes.** The phase stepper only exists on `/progress/:id` and disappears entirely on `/review/:id`; a user landing on the review page has no visual confirmation of "you're on the last step" — the three routes feel like disconnected pages rather than one workflow.
6. **Phase names are internal jargon presented verbatim.** "exploring", "analyzing", "reconciling" are shown to the user with no plain-language gloss (e.g. "Reconciling — merging what we observed in the browser with what we found in your code").

## Implementation Notes

1. **Provenance legend:** add a small legend/key component (reusable, shown once near the top of the Gherkin editor or as a persistent tooltip-on-hover per badge) explaining: `ui` = observed in the live browser, `code` = extracted from source code, `merged` = confirmed by both, plus what a conflict warning means. Also add `aria-label`/`title` attributes on each badge so screen readers get the same information (ties into Task 9).
2. **Disabled-state copy:** add a short inline hint next to (or replacing the empty space around) the disabled export section, e.g. "Approve the Gherkin above to enable export and downloads," conditionally rendered via `*ngIf="!store.approved()"`.
3. **Instructions help text:** add placeholder/example text derived from the PRD's own example instruction, plus a one-line hint above the textarea like "Describe the steps BAIA should take, in plain English — e.g. 'Click Start quote, fill in the details form, and confirm the success page appears.'"
4. **Style the repository section:** add CSS rules for `details.repo-section`/`summary` matching the existing design tokens (`--surface-card`, `--radius-md`, `--hairline` per `STYLE_GUIDE.md`) so it looks like a designed disclosure, not a browser default. Also clarify field-level copy for `credentialsRef` (what format is expected — the existing placeholder `e.g. repo:my-org/my-repo` is a start but should be paired with a one-line explanation of what a "credentials reference" is, given it's referencing a value stored via the app's credential store, not a raw token typed into the URL field).
5. **Cross-route step indicator:** extract a small shared "workflow breadcrumb" component (Input → Progress → Review, with the current step highlighted) shown consistently in the app shell/nav (`app.component.html`) rather than only inside the progress page, so the review page also shows "you're done exploring/analyzing/reconciling."
6. **Plain-language phase glosses:** add a one-line description per phase (in the stepper or an adjacent tooltip) — this can be a static lookup table (`{ exploring: 'Navigating the site and recording what happens', analyzing: 'Reading the source code for business rules', reconciling: 'Merging observed behavior with code-derived rules', review: 'Your turn to review and approve' }`).

## Acceptance Criteria

- [ ] A visible legend (or per-badge tooltip + aria-label) explains `ui`/`code`/`merged`/conflict provenance values on the review page.
- [ ] Disabled export controls are accompanied by a visible explanation of what unlocks them.
- [ ] The Instructions field includes a concrete example (ideally sourced from the PRD) and a one-line usage hint.
- [ ] The Repository (optional) `<details>` section has custom styling consistent with `STYLE_GUIDE.md` tokens, not browser defaults.
- [ ] A workflow step indicator (Input → Progress → Review) is visible on all three routes, not just the progress page.
- [ ] Each pipeline phase name shown to the user is paired with a plain-language description.
- [ ] Manually walking through `MANUAL_TEST_GUIDE.md` Phase 3 and 5 as a first-time user, every visible label/state is self-explanatory without referring to this review or the source code.

## Affected Files

- `baia-ui/src/app/review/gherkin-editor.component.html/.ts/.scss`
- `baia-ui/src/app/review/export-panel.component.html/.ts`
- `baia-ui/src/app/input/input.component.html/.ts`
- `baia-ui/src/styles.css` (repo-section styling)
- `baia-ui/src/app/app.component.html/.ts` (shared breadcrumb)
- `baia-ui/src/app/progress/progress.component.html/.ts` (phase glosses, breadcrumb integration)
