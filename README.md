# Financial Model Mapper

A browser-based tool that assists financial analysts in standardising line-item row labels in Excel financial models (Income Statement, Balance Sheet, Cash Flow Statement) against a target parameter taxonomy and historical mappings.

## Features

- **Client-side execution**: Static HTML/CSS/ES modules. Runs in any modern browser without a backend or server database.
- **Selective Sheet Parsing**: Reads workbook metadata using SheetJS and parses only the sheet selected by the user.
- **Multi-tiered Matching Engine**:
  1. Historical mapping match (Sheet + Normalised Label, with optional Template scoping) -> High confidence.
  2. Taxonomy alias exact match (Normalised) -> Medium confidence.
  3. Conflict tracking when differing historical mappings or taxonomy aliases exist.
- **Conflict Tracking**: Identifies when multiple historical mappings or taxonomy aliases exist for a single label.
- **Review and Override**: Review suggestions, accept with one click, select alternatives from a categorized dropdown, or leave items unmapped.
- **CSV Export**: Export final model row mappings and optionally export an updated history CSV with accepted mappings appended.

## Quick Start

No build step or bundler is required.

1. Clone or download this repository.
2. Serve the directory using any static web server:
   ```bash
   # Python 3
   python -m http.server 8000

   # Node.js
   npx serve financial-model-mapper
   ```
3. Open `http://localhost:8000` in your browser (or open `index.html` directly if using a browser configured to allow local ES module fetches).

## Project Layout

```
financial-model-mapper/
├── index.html
├── styles.css
├── README.md
├── LICENSE
├── config/
│   ├── taxonomy.json       Bundled sample parameter taxonomy
│   └── settings.json       Normalisation rules and matching options
├── data/
│   └── sample-history.csv  Sample historical mapping records
├── sample/
│   └── README.md           Guidance on acquiring sample financial models
├── src/
│   ├── main.js             Application entry point and state management
│   ├── ui.js               DOM rendering and UI event helpers
│   ├── excelReader.js      SheetJS workbook extraction
│   ├── historyLoader.js    RFC 4180 CSV parser and history normaliser
│   ├── taxonomy.js         Taxonomy validation and alias indexer
│   ├── normalise.js        Configurable string normalisation
│   ├── matcher.js          Pure matching engine
│   └── exporter.js         Mapping and history CSV generator
└── tests/
    ├── matcher.test.js     Matcher engine unit tests
    ├── modules.test.js     Normalisation, CSV parsing, and taxonomy tests
    ├── excelReader.test.js Workbook row extraction tests
    └── exporter.test.js    CSV export serialization tests
```

## File Formats

### 1. Taxonomy JSON (`config/taxonomy.json`)

The taxonomy defines the universe of target parameters and their aliases.

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
  - `displayName` (string): Display label shown in menus.
  - `category` (string): Grouping slug (e.g., `income_statement`, `balance_sheet`, `cash_flow`).
  - `aliases` (array of strings): Alternative names mapped to this parameter.

To add new parameters or categories, add objects to the `parameters` array in `config/taxonomy.json` or upload a custom JSON file through the UI.

### 2. Settings JSON (`config/settings.json`)

Defines normalisation flags and matching behaviour:

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

### 3. History CSV Header (`data/sample-history.csv`)

History files must adhere to this exact column header:

```csv
template_id,sheet,row_label,normalized_label,parameter_id,mapped_by,mapped_at
```

- `template_id`: Template or model identifier.
- `sheet`: Sheet name (e.g., `IS`, `BS`, `CF`).
- `row_label`: Raw line item label.
- `normalized_label`: Normalised string (automatically computed if blank).
- `parameter_id`: Target parameter ID matching the taxonomy.
- `mapped_by`: Analyst identifier.
- `mapped_at`: ISO 8601 timestamp string.

### 4. Mapping Export CSV Header

When exporting mappings, the downloaded CSV contains:

```csv
model_file,sheet,row_index,row_label,parameter_id,source,confidence
```

## Running Tests

Unit tests are written in vanilla JavaScript and run directly with Node.js without third-party dependencies:

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
