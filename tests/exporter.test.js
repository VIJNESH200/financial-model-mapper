/**
 * @fileoverview Unit tests for exporter.js CSV generation.
 */

import { escapeCsvField, buildMappingCsv, buildUpdatedHistoryCsv } from '../src/exporter.js';
import { parseCsvRows } from '../src/historyLoader.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL: ${message}`);
  } else {
    passed += 1;
    console.log(`PASS: ${message}`);
  }
}

console.log('--- Testing exporter.js ---');

{
  assert(escapeCsvField('simple') === 'simple', 'No escaping needed for simple token');
  assert(escapeCsvField('hello, world') === '"hello, world"', 'Quotes commas');
  assert(escapeCsvField('say "hi"') === '"say ""hi"""', 'Doubles internal quotes');
  assert(escapeCsvField('line1\nline2') === '"line1\nline2"', 'Quotes newlines');
  assert(escapeCsvField(null) === '', 'Handles null');
}

{
  const mappings = [
    {
      sheet: 'IS',
      rowIndex: 7,
      rawLabel: 'Net Sales, Total',
      parameterId: 'revenue',
      source: 'taxonomy',
      confidence: 'medium',
    },
    {
      sheet: 'IS',
      rowIndex: 8,
      rawLabel: 'Unmapped Row',
      parameterId: null,
      source: 'none',
      confidence: null,
    },
  ];

  const csv = buildMappingCsv(mappings, 'model2024.xlsx');
  const rows = parseCsvRows(csv);

  assert(rows[0].join(',') === 'model_file,sheet,row_index,row_label,parameter_id,source,confidence', 'Exact mapping header');
  assert(rows.length === 3, 'Contains header and 2 rows');
  assert(rows[1][0] === 'model2024.xlsx', 'Includes model file name');
  assert(rows[1][3] === 'Net Sales, Total', 'Properly unescaped raw label with comma');
  assert(rows[1][4] === 'revenue', 'Includes parameter ID');
  assert(rows[2][4] === '', 'Unmapped row has empty parameter_id');
}

{
  const existingHistory = [
    {
      templateId: 'tpl_1',
      sheet: 'IS',
      rowLabel: 'Old Label',
      normLabel: 'old label',
      parameterId: 'revenue',
      mappedBy: 'analyst1',
      mappedAt: '2025-01-01T00:00:00Z',
    },
  ];

  const newMappings = [
    {
      sheet: 'IS',
      rawLabel: 'New Label',
      normLabel: 'new label',
      parameterId: 'cogs',
    },
    {
      sheet: 'IS',
      rawLabel: 'Skipped Row',
      normLabel: 'skipped row',
      parameterId: null, // should NOT be appended
    },
  ];

  const csv = buildUpdatedHistoryCsv(existingHistory, newMappings, {
    templateId: 'tpl_test',
    mappedBy: 'analyst99',
    mappedAt: '2025-03-01T12:00:00Z',
  });

  const rows = parseCsvRows(csv);
  assert(rows[0].join(',') === 'template_id,sheet,row_label,normalized_label,parameter_id,mapped_by,mapped_at', 'Exact history header');
  assert(rows.length === 3, 'Includes existing record and 1 newly accepted record (skipped row ignored)');
  assert(rows[2][0] === 'tpl_test' && rows[2][4] === 'cogs' && rows[2][5] === 'analyst99', 'Appended new record with correct metadata');
}

console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
