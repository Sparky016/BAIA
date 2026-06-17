# Product Requirements Document (PRD): BAIA (Business Analyst AI)

**Document Status:** Updated
**Product Name:** BAIA (Business Analyst AI)
**Target Platform:** Web Application (Angular Frontend, Node.js/Python Backend Orchestrator)

---

## 1. Executive Summary

**BAIA** is an autonomous agent designed to revolutionize software documentation. By combining simulated user behavior (exploratory UI testing) with deep codebase analysis, BAIA outputs exhaustive, Gherkin-formatted (Given-When-Then) business requirements. This dual-phase approach ensures that both user-facing workflows and underlying programmatic business rules are captured, reconciled, and exported to Confluence for organizational visibility.

## 2. Product Vision & Scope

BAIA operates in two primary phases:

1. **Phase 1: Exploratory Analyst (Behavioral UI Analysis):** An autonomous agent driven by user instructions that utilizes Playwright to navigate a live URL, capturing UI elements, page states, and user journeys.
2. **Phase 2: Code Analyst (Static Logic Analysis):** An agent that ingests the corresponding source code repository (GitHub/Azure) to uncover hidden business rules and edge cases missed during the UI crawl, merging these findings into the final documentation.

---

## 3. System Architecture & Technology Stack

- **Frontend User Interface:** **Angular** (Strict requirement). Handles user inputs, state management, and display of generated documentation.
- **Backend Orchestrator:** Node.js or Python application to handle API requests and manage agent workflows.
- **Browser Automation:** Playwright (orchestrated by BAIA to execute browsing commands).
- **AI/LLM Core:** A large language model capable of translating natural language to Playwright actions, translating DOM/code to Gherkin, and merging datasets.
- **Integrations:** GitHub API, Azure Repos API, Confluence REST API.

---

## 4. Functional Requirements

### 4.1. Phase 1: Exploratory Analyst

- **Input Mechanisms:**
- Target URL input field.
- A large, free-form text area for detailed behavioral instructions (e.g., _"Click 'Start quote', enter details, navigate to success page"_).

- **Playwright Orchestration:**
- BAIA parses natural language instructions and dynamically generates/executes Playwright commands.
- Exploratory crawl captures DOM elements, network responses, and application states within instruction constraints.

- **Gherkin Generation:**
- BAIA translates observed behaviors into standard BDD Gherkin format (`Feature`, `Scenario`, `Given`, `When`, `Then`).

### 4.2. Phase 2: Code Analyst

- **Repository Connection:**
- UI inputs for repository URLs (GitHub or Azure Repos) and secure credential handling.

- **Codebase Analysis:**
- BAIA scans the repository, targeting domain logic, controllers, and validation schemas to extract business rules (e.g., constraints, calculations).

- **Reconciliation & Merge:**
- BAIA cross-references UI behavioral documentation with codebase rules to create a unified, enriched requirement document.

### 4.3. Review & Export

- **Review Dashboard:** An Angular interface for reviewing, editing, and approving the generated documentation.
- **Confluence Integration:** One-click export via Confluence API to push final Gherkin documents to specific Confluence Spaces.

---

## 5. User Stories (Agile Backlog)

| Epic               | User Story                                                                       | Acceptance Criteria                                                      |
| ------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Frontend**       | As a user, I want a form to input a target URL and instructions for BAIA.        | URL validated; text area handles detailed logic; "Start BAIA" trigger.   |
| **UI Exploration** | As BAIA, I need to translate instructions into Playwright scripts.               | Browser navigates accurately; handles clicks/inputs; reports errors.     |
| **Gherkin Export** | As a user, I want BAIA to generate documentation in Gherkin format.              | Consistent BDD syntax used; steps accurately map to UI actions.          |
| **Code Analysis**  | As BAIA, I need to scan repositories to extract underlying logic.                | Repo cloned securely; rules/validations extracted and categorized.       |
| **Reconciliation** | As a user, I want a unified document from BAIA that merges UI and code insights. | UI steps enriched with backend business rules.                           |
| **Documentation**  | As a user, I want to push documentation to Confluence.                           | Successful API authentication; document renders correctly in Confluence. |

---

## 6. Developer Task Breakdown

1. **Angular Scaffold:** Set up routing (Input, Progress, Results View) and state management (RxJS/NgRx).
2. **Playwright Sandbox:** Develop the backend service to execute Playwright commands dynamically via an LLM agent framework (e.g., LangChain).
3. **Code Ingestion Engine:** Build the utility to clone/analyze repos and chunk code for context window optimization.
4. **LLM Prompting & Formatting:** Develop system prompts to enforce Gherkin standards and ensure logical merging of disparate data sources.

---

_How would you like to prioritize the initial sprint for BAIA development?_
