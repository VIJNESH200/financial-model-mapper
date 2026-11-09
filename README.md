# Financial Model Mapper

A browser-based tool that assists financial analysts in standardizing line-item row labels in Excel financial models (Income Statement, Balance Sheet, Cash Flow Statement) against a target parameter taxonomy and historical mappings.

## Features

- **Client-side execution**: Static HTML/CSS/ES modules. Runs in any modern browser without a backend server. Excel parsing is powered by SheetJS (pinned to v0.20.3 from the official SheetJS CDN).
- **Selective Sheet Parsing**: Reads workbook metadata using SheetJS and parses only the sheet selected by the user.
- **Multi-tiered Matching Engine**:
  1. **Historical Mapping Match**: Matches on Sheet + Normalized Label (scoped to Template ID if specified in the UI) -> High confidence (`source: 'history'`). If multiple records match, the most recent `mapped_at` timestamp is preferred.
  2. **Taxonomy Exact Match**: Matches on target parameter `displayName` or alias list (Normalized) -> Medium confidence (`source: 'taxonomy'`).
  3. **No Match**: When no candidate is found or confidence is below the configured threshold, the row remains unmapped (`source: 'none'`).
- **Conflict Tracking**: Detects and flags when multiple historical records map to conflicting parameter IDs, or when a label matches multiple taxonomy parameters.
- **Review and Override**: Review suggestions, accept suggestions, select alternatives from a categorized dropdown, or leave items unmapped.
- **CSV Export**: Export final model row mappings and optionally export an updated history CSV with newly accepted mappings appended.

## Quick Start

No build step or bundler is required.

1. Clone or download this repository.
2. Navigate into the repository directory and start any local static web server:
   ```bash
   # Python 3
   python -m http.server 8000

   # Node.js
   npx serve .
   ```
3. Open `http://localhost:8000` in your web browser. A local HTTP server is required because modern browsers enforce CORS restrictions on `file://` fetch requests for configuration assets.

## Project Layout

```
financial-model-mapper/
├── index.html
├── styles.css
├── README.md
├── LICENSE
├── config/
│   ├── taxonomy.json       Bundled sample parameter taxonomy
│   └── settings.json       Normalization rules and matching options
├── data/
│   └── sample-history.csv  Sample historical mapping records
├── sample/
│   ├── README.md                  Guidance on sample financial models
│   └── sample_financial_model.xlsx Bundled 3-statement test workbook (IS, BS, CF)
├── src/
│   ├── main.js             Application entry point and state management
│   ├── ui.js               DOM rendering and UI event helpers
│   ├── excelReader.js      SheetJS workbook extraction
│   ├── historyLoader.js    RFC 4180 CSV parser and history normalizer
│   ├── taxonomy.js         Taxonomy validation and alias indexer
│   ├── normalise.js        Configurable string normalization
│   ├── matcher.js          Pure matching engine
│   └── exporter.js         Mapping and history CSV generator
└── tests/
    ├── matcher.test.js     Matcher engine unit tests
    ├── modules.test.js     Normalization, CSV parsing, and taxonomy tests
    ├── excelReader.test.js Workbook row extraction tests
    └── exporter.test.js    CSV export serialization tests
```

## File Formats

### 1. Excel Financial Model Input (`.xlsx`, `.xlsm`)

The tool parses standard Excel workbooks in the browser:
- **Supported extensions**: `.xlsx`, `.xlsm`.
- **Sheet selection**: Workbook metadata is read first (`bookSheets: true`); only the selected sheet is parsed.
- **Row label extraction**: Scans columns from left to right and selects the first non-empty cell containing textual characters (`/\p{L}/u`), ignoring purely numerical values or standalone years. Formula error cells (`#REF!`, `#VALUE!`, `#N/A`, `#NAME?`) are explicitly ignored.
- **Column scanning bounds**: Labels are read from the first column of the sheet’s used range, checking up to 26 columns to the right. Text placed further right is ignored.
- **Performance**: Skips fully empty rows early and yields to the UI thread in 250-row chunks with progress reporting.

### 2. Taxonomy JSON (`config/taxonomy.json`)

The taxonomy defines target parameters and their aliases.

```json
{
  "version": 1,
  "parameters": [
    {
      "id": "revenue",
      "displayName": "Revenue",
      "category": "income_statement",
      "aliases": ["Net Sales", "Total Revenue", "Sales"]
    }
  ]
}
```

- `version` (number): Schema version integer.
- `parameters` (array): List of parameter definitions.
  - `id` (string): Unique identifier.
  - `displayName` (string): Display label shown in menus (participates in exact matching).
  - `category` (string): Grouping slug (e.g., `income_statement`, `balance_sheet`, `cash_flow`).
  - `aliases` (array of strings): Alternative names mapped to this parameter.

To add new parameters or categories, add objects to the `parameters` array in `config/taxonomy.json` or upload a custom JSON file through the UI.

### 3. Settings JSON (`config/settings.json`)

Defines normalization flags and matching behavior:

```json
{
  "normalisation": {
    "lowercase": true,
    "trimWhitespace": true,
    "collapseSpaces": true,
    "stripPunctuation": true
  },
  "matching": {
    "useSheetContext": true,
    "minimumConfidence": "low"
  }
}
```

- `normalisation`: Flags controlling label preparation before matching:
  - `lowercase` (boolean): Converts labels to lowercase.
  - `trimWhitespace` (boolean): Trims leading and trailing whitespace.
  - `collapseSpaces` (boolean): Collapses consecutive whitespace characters into a single space.
  - `stripPunctuation` (boolean): Replaces non-alphanumeric, non-whitespace characters with spaces.
- `matching`: Options governing matching engine behavior:
  - `useSheetContext` (boolean): When `true`, historical mappings require matching sheet names case-insensitively; when `false`, historical labels match across any sheet.
  - `minimumConfidence` (string): Minimum threshold required to retain a suggestion (`'none'`, `'low'`, `'medium'`, `'high'`). Suggestions below threshold return `source: 'none'`.

### 4. History CSV Header (`data/sample-history.csv`)

History files must adhere to this exact column header:

```csv
template_id,sheet,row_label,normalized_label,parameter_id,mapped_by,mapped_at
```

- `template_id`: Template or model identifier (used by UI Template ID scoping).
- `sheet`: Sheet name (e.g., `IS`, `BS`, `CF`).
- `row_label`: Raw line item label.
- `normalized_label`: Normalized string (automatically computed if blank).
- `parameter_id`: Target parameter ID matching the taxonomy.
- `mapped_by`: Analyst identifier.
- `mapped_at`: ISO 8601 timestamp string (newest record breaks ties).

### 5. Mapping Export CSV Header

When exporting mappings, the downloaded CSV contains:

```csv
model_file,sheet,row_index,row_label,parameter_id,source,confidence
```

- `model_file` (string): Filename of the source Excel workbook.
- `sheet` (string): Sheet name containing the row.
- `row_index` (integer): 1-based row index in the Excel sheet.
- `row_label` (string): Extracted raw line item label.
- `parameter_id` (string): Assigned taxonomy parameter identifier (blank if unmapped).
- `source` (enum): Origin of assignment (`'history'`, `'taxonomy'`, `'manual'`, or `'none'`).
- `confidence` (enum/string): Confidence score (`'high'`, `'medium'`, or blank if unmapped/manual).
- **Formula Sanitization (CWE-1236)**: Exported label text starting with =, +, -, @, or a tab gets a leading apostrophe so spreadsheet apps don’t run it as a formula. The apostrophe stays in the row_label column. normalized_label removes it, so matching is unaffected.

### 6. Updated History CSV Export (`updated_history.csv`)

Exporting updated history appends newly accepted row mappings to the active history:
- **Session Scope**: Exports combine all sheets reviewed in the current session (`state.sheetRowsMap`).
- **De-duplication**: Prevents duplicates by checking existing keys using `templateId + sheet + normLabel + parameterId` delimited by `\u0001` (lowercased and trimmed).
- **Formula Sanitization**: Applied identically to exported history records using the leading apostrophe (`'`) convention for formula triggers.
- **Source Filter**: Mappings already sourced from `history` are skipped; only new assignments (`taxonomy`, `manual`, or external) are appended.
- **Metadata**: Records are tagged with the Template Identifier and Analyst Name entered in the export panel, with `mapped_at` set to the current ISO 8601 timestamp.

## Running Tests

Unit tests are written in vanilla JavaScript with native ES module syntax. Run with Node.js (version 22+ recommended for automatic ES module detection):

```bash
node tests/matcher.test.js
node tests/modules.test.js
node tests/excelReader.test.js
node tests/exporter.test.js
```

## Contributing

1. Keep dependencies zeroed: use vanilla JavaScript and native web APIs.
2. Follow the Google JavaScript Style Guide (2 spaces, `const`/`let`, semicolons, named exports).
3. Ensure all unit tests pass before submitting changes.
4. Note on module exports: `escapeCsvField` (`src/exporter.js`) and `parseCsvRows` (`src/historyLoader.js`) are internal helpers exported specifically to facilitate isolated unit testing.
