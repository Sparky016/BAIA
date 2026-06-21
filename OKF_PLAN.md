# OKF Integration Plan for BAIA (with Gherkin Preservation)

## 1. Overview
The Open Knowledge Format (OKF) is a Markdown-based knowledge format with YAML frontmatter. Integrating OKF into BAIA's documentation system means BAIA will format its generated `GherkinDoc` and business rules into an OKF-compliant structure. This enables downstream agents, LLMs, or humans to navigate the documentation as a self-contained knowledge bundle.

To preserve the raw Gherkin format document, BAIA will treat Gherkin and OKF as coexisting formats:
- The UI will keep the Gherkin editor and the direct "Export to Confluence" panel.
- A new section will allow downloading the raw `.feature` file (standard Gherkin format).
- Users can also download an OKF bundle (`.zip`) containing the OKF Markdown concepts and the original Gherkin files in parallel.

## 2. Applicability & Coexistence in BAIA
Currently, BAIA generates a `GherkinDoc` containing BDD Features and Scenarios.
By integrating OKF, BAIA will:
- **Concept Mapping:** Each Gherkin Feature becomes an OKF Concept file (`features/feature-name.md`).
- **Raw Gherkin:** Alongside each Concept, the raw `.feature` file is exported (`features/feature-name.feature`).
- **Rich Metadata:** Inject YAML frontmatter with fields like `type: Feature`, `resource: <targetUrl>`, and `timestamp: <generatedAt>`.
- **Knowledge Bundles:** Package the generated features (`.md` and `.feature`) alongside an `index.md` to form a complete OKF knowledge bundle for a given run, downloadable as a `.zip`.

## 3. Suggested Architectural Changes

### A. OKF & Gherkin Generator (Backend)
- Add a new utility `baia-server/src/export/okf-generator.ts`.
- Implement `gherkinDocToFeatureFile(feature: GherkinFeature): string` to render a single feature in standard Gherkin syntax.
- Implement `gherkinDocToOkfBundle(doc: GherkinDoc, targetUrl: string)` to build:
  - `index.md` listing the features.
  - `features/<name>.md` with OKF metadata and steps inside a ` ```gherkin ` block.
  - `features/<name>.feature` containing raw Gherkin.
  - A ZIP payload containing all of the above.

### B. API Enhancements
- Add `GET /api/runs/:id/export/gherkin` to download the raw `.feature` file.
- Add `GET /api/runs/:id/export/okf` to download the OKF bundle (`.zip`).

### C. UI Enhancements
- Update the Review page (`baia-ui/src/app/review/export-panel.component.html`) to expose these new download links.
- Implement file download triggers in `export-panel.component.ts`.

## 4. Developer Tasks

- [ ] **Task 1: Core Generator Utility**
  - Create `baia-server/src/export/okf-generator.ts`.
  - Implement conversion logic to raw `.feature` string and OKF markdown.
  - Package files into a ZIP archive.
  - Write unit tests.

- [ ] **Task 2: API Endpoints**
  - Add download handlers in `export.controller.ts`.

- [ ] **Task 3: UI Integration**
  - Connect UI buttons in `export-panel.component` to download endpoints.
