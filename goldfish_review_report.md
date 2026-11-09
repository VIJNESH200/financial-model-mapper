# Goldfish Annotated Review Report

**Target:** `financial-model-mapper/README.md` (`Lines 1-151`)  
**Auditors:** `egm-codebase-details`, `egm-style`, `egm-comprehension`  
**Status:** resolved (All proposed fixes accepted and applied)

## Prioritized Findings & AI Suggestions

### [Issue 1] [`egm-codebase-details`, `egm-style`, `egm-comprehension`] - Severity: Blocker
*   **Affected Scope:** [Lines 9–13](README.md#L9-L13) (`Multi-tiered Matching Engine`)
*   **Discrepancy Description:** The documentation lists "Conflict tracking when differing historical mappings or taxonomy aliases exist" as Tier 3 of the matching engine, immediately duplicated by line 13 as a separate feature bullet. In the code, the matching engine only has two sequential tiers (Tier 1: History, Tier 2: Taxonomy alias/displayName), and falls back to `source: 'none', parameterId: null`. Conflict detection is an orthogonal metadata flag (`hasConflict`, `conflicts`), not a fallback tier.
*   **Rationale:** Falsely presenting conflict tracking as a third fallback matching tier confuses developers about how matches are computed and omits the actual fallback behavior (unmapped).
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Re-structure the section to clearly present the two sequential matching tiers, the final unmapped fallback, and document Conflict Tracking as an orthogonal evaluation mechanism.
*   ***Proposed Edit:***
    *   Location: `## Features` -> `Multi-tiered Matching Engine`
    *   Change:
        ```markdown
        - **Multi-tiered Matching Engine**:
          1. **Historical Mapping Match**: Matches on Sheet + Normalised Label (scoped to Template ID if specified) -> High confidence (`source: 'history'`). If multiple records match, the most recent `mapped_at` timestamp is preferred.
          2. **Taxonomy Exact Match**: Matches on target parameter `displayName` or alias list (Normalised) -> Medium confidence (`source: 'taxonomy'`).
          3. **No Match**: When no candidate is found or confidence is below the configured threshold, the row remains unmapped (`source: 'none'`).
        - **Conflict Tracking**: Detects and flags when multiple historical records map to conflicting parameter IDs, or when a label matches multiple taxonomy parameters.
        ```

---

### [Issue 2] [`egm-codebase-details`, `egm-comprehension`] - Severity: Major
*   **Affected Scope:** [Lines 8, 63](README.md#L63) (`File Formats`)
*   **Discrepancy Description:** The README specifies format requirements for JSON and CSV files, but completely omits the specification for the primary input file: the Excel financial model. Supported extensions (`.xlsx`, `.xlsm`), sheet structure, and line-item extraction rules are undocumented.
*   **Rationale:** Users and contributors need to know how the tool parses workbooks (scanning for the first cell containing Unicode letters, ignoring pure numbers/years, skipping empty rows, and yielding every 250 rows).
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Add an "Excel Model Input (.xlsx, .xlsm)" section under `## File Formats` detailing extraction heuristics and requirements.
*   ***Proposed Edit:***
    *   Location: `## File Formats` (insert as Subsection 1 before Taxonomy JSON)
    *   Change:
        ```markdown
        ### 1. Excel Financial Model Input (`.xlsx`, `.xlsm`)

        The tool parses standard Excel workbooks in the browser:
        - **Supported extensions**: `.xlsx`, `.xlsm`.
        - **Sheet selection**: Workbook metadata is read first; only the selected sheet is parsed.
        - **Row label extraction**: Scans columns from left to right and selects the first non-empty cell containing textual characters (`/\p{L}/u`), ignoring purely numerical values or standalone years.
        - **Performance**: Skips fully empty rows early and yields to the UI thread in 250-row chunks with progress reporting.
        ```

---

### [Issue 3] [`egm-codebase-details`, `egm-comprehension`] - Severity: Major
*   **Affected Scope:** [Lines 92–109](README.md#L92-L109) (`Settings JSON`)
*   **Discrepancy Description:** Section 2 reproduces `settings.json` syntax without defining what any flag does, omitting allowed values for `minimumConfidence` (`none`, `low`, `medium`, `high`) and how `useSheetContext` works.
*   **Rationale:** Developers and analysts modifying settings cannot know what values are valid or how they affect matching.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Add comprehensive parameter definitions, types, and descriptions directly under the settings JSON snippet.
*   ***Proposed Edit:***
    *   Location: `### 2. Settings JSON (config/settings.json)`
    *   Change:
        ```markdown
        - `normalisation`: Flags controlling label preparation before matching:
          - `lowercase` (boolean): Converts labels to lowercase.
          - `trimWhitespace` (boolean): Trims leading and trailing whitespace.
          - `collapseSpaces` (boolean): Collapses consecutive whitespace characters into a single space.
          - `stripPunctuation` (boolean): Replaces non-alphanumeric, non-whitespace characters with spaces.
        - `matching`: Options governing matching engine behavior:
          - `useSheetContext` (boolean): When `true`, historical mappings require matching sheet names case-insensitively; when `false`, historical labels match across any sheet.
          - `minimumConfidence` (string): Minimum threshold required to retain a suggestion (`'none'`, `'low'`, `'medium'`, `'high'`). Suggestions below threshold return `source: 'none'`.
        ```

---

### [Issue 4] [`egm-codebase-details`, `egm-comprehension`] - Severity: Major
*   **Affected Scope:** [Lines 127–134](README.md#L127-L134) (`Mapping Export CSV Header`)
*   **Discrepancy Description:** Section 4 lists only the raw header string without explaining column meanings, data types, 1-based indexing, or enum values.
*   **Rationale:** Downstream users integrating with the exported CSV need exact column contracts.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Add full column specifications for the Mapping Export CSV.
*   ***Proposed Edit:***
    *   Location: `### 4. Mapping Export CSV Header`
    *   Change:
        ```markdown
        - `model_file` (string): Filename of the source Excel workbook.
        - `sheet` (string): Sheet name containing the row.
        - `row_index` (integer): 1-based row index in the Excel sheet.
        - `row_label` (string): Extracted raw line item label.
        - `parameter_id` (string): Assigned taxonomy parameter identifier (blank if unmapped).
        - `source` (enum): Origin of assignment (`'history'`, `'taxonomy'`, `'manual'`, or `'none'`).
        - `confidence` (enum/string): Confidence score (`'high'`, `'medium'`, or blank if unmapped/manual).
        ```

---

### [Issue 5] [`egm-codebase-details`] - Severity: Major
*   **Affected Scope:** [Lines 15, 127–134](README.md#L15) (`CSV Export`)
*   **Discrepancy Description:** The documentation mentions exporting an updated history CSV, but does not specify the export rules, the deduplication composite key (`templateId + sheet + normLabel + parameterId` joined by `\u0001`), or multi-sheet aggregation across the session.
*   **Rationale:** The updated history export is a core workflow feature with specific business logic that must be documented.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Add Subsection 5 under `## File Formats` detailing the updated history CSV export, deduplication, and multi-sheet aggregation.
*   ***Proposed Edit:***
    *   Location: `## File Formats` (add as Subsection 5)
    *   Change:
        ```markdown
        ### 5. Updated History CSV Export (`updated_history.csv`)

        Exporting updated history appends newly accepted row mappings to the active history:
        - **Session Scope**: Exports combine all sheets reviewed in the current session (`state.sheetRowsMap`).
        - **De-duplication**: Prevents duplicates by checking existing keys using `templateId + sheet + normLabel + parameterId` delimited by `\u0001` (lowercased and trimmed).
        - **Source Filter**: Mappings already sourced from `history` are skipped; only new assignments (`taxonomy`, `manual`, or external) are appended.
        - **Metadata**: Records are tagged with the Template Identifier and Analyst Name entered in the export panel, with `mapped_at` set to the current ISO 8601 timestamp.
        ```

---

### [Issue 6] [`egm-codebase-details`, `egm-style`, `egm-comprehension`] - Severity: Major
*   **Affected Scope:** [Lines 21–30](README.md#L21-L30) (`Quick Start`)
*   **Discrepancy Description:** Quick Start commands mix directory assumptions (`python -m http.server 8000` assumes current directory, while `npx serve financial-model-mapper` assumes parent directory). Additionally, Line 30 suggests opening `index.html` directly via `file://`, which fails because browser CORS blocks local `fetch()` calls for bundled JSON/CSV assets.
*   **Rationale:** Conflicting commands and misleading `file://` suggestions break onboarding for new developers.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Standardize commands to run from the repository root directory and mandate running a local static server.
*   ***Proposed Edit:***
    *   Location: `## Quick Start`
    *   Change:
        ```markdown
        1. Clone or download this repository.
        2. Navigate into the repository directory and start any local static web server:
           ```bash
           # Python 3
           python -m http.server 8000

           # Node.js
           npx serve .
           ```
        3. Open `http://localhost:8000` in your web browser. A local HTTP server is required because modern browsers enforce CORS restrictions on `file://` fetch requests.
        ```

---

### [Issue 7] [`egm-codebase-details`, `egm-comprehension`] - Severity: Major
*   **Affected Scope:** [Lines 135–145](README.md#L135-L145) (`Running Tests`)
*   **Discrepancy Description:** Test scripts use ES module syntax (`import`/`export`) without a `package.json` declaring `"type": "module"`. In Node.js versions prior to Node 22, running `node tests/*.test.js` without flags fails with `SyntaxError: Cannot use import statement outside a module`.
*   **Rationale:** Contributors running tests on LTS environments need clear invocation instructions.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Document the Node.js requirement (Node 22+ with automatic ES module detection, or running with `--experimental-detect-module`).
*   ***Proposed Edit:</a>
    *   Location: `## Running Tests`
    *   Change:
        ```markdown
        Unit tests are written in vanilla JavaScript with native ES module syntax. Run with Node.js (version 22+ recommended for automatic ES module detection):

        ```bash
        node tests/matcher.test.js
        node tests/modules.test.js
        node tests/excelReader.test.js
        node tests/exporter.test.js
        ```
        ```

---

### [Issue 8] [`egm-comprehension`] - Severity: Major
*   **Affected Scope:** [Lines 8, 50, 148](README.md#L8) (`Dependencies & SheetJS`)
*   **Discrepancy Description:** SheetJS is referenced as a parser but its version and CDN origin are not documented, creating ambiguity for air-gapped or restricted financial environments.
*   **Rationale:** Developers in corporate environments need to know the origin and version of third-party libraries.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Document that SheetJS is pinned to v0.20.3 from the official SheetJS CDN in `index.html`.
*   ***Proposed Edit:***
    *   Location: `## Features` -> `Client-side execution`
    *   Change:
        ```markdown
        - **Client-side execution**: Static HTML/CSS/ES modules. Runs in any modern browser without a backend server. Excel parsing is powered by SheetJS (pinned to v0.20.3 from the official SheetJS CDN).
        ```

---

### [Issue 9] [`egm-codebase-details`, `egm-comprehension`] - Severity: Nit
*   **Affected Scope:** [Lines 10, 119](README.md#L10) (`Template Scoping`)
*   **Discrepancy Description:** Line 10 mentions "Template scoping", but does not explain how it is controlled in the UI or how it behaves when left empty.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Add an explanation that entering a Template ID scopes historical matching to that specific template, and leaving it blank matches across all historical templates.
*   ***Proposed Edit:***
    *   Location: `## Features` -> `Multi-tiered Matching Engine`
    *   Change: Integrated into Issue 1 proposed edit.

---

### [Issue 10] [`egm-style`] - Severity: Nit
*   **Affected Scope:** [Lines 3, 7, 14, 67, 151](README.md#L3) (`Style & Consistency`)
*   **Discrepancy Description:** Promotional fluff ("universe of target parameters", "accept with one click"), spelling variation between British and American English, and defensive wording in contributor notes.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Standardize on direct technical phrasing and American English.
*   ***Proposed Edit:***
    *   Location: Across lines 3, 7, 14, 67, and 151.
    *   Change: "standardizing", "defines target parameters", "accept suggestions", "without a backend server".
