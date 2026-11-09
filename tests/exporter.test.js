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

  // Formula injection sanitization (CWE-1236)
  assert(escapeCsvField('=SUM(A1:B10)') === "'=SUM(A1:B10)", 'Prefixes = trigger with single quote');
  assert(escapeCsvField('+44') === "'+44", 'Prefixes + trigger with single quote');
  assert(escapeCsvField('- Depreciation') === "'- Depreciation", 'Prefixes - trigger with single quote');
  assert(escapeCsvField('@SUM(1)') === "'@SUM(1)", 'Prefixes @ trigger with single quote');
  assert(escapeCsvField('\tcmd') === "'\tcmd", 'Prefixes tab trigger with single quote');
  assert(escapeCsvField('\rreturn') === "\"'\rreturn\"", 'Prefixes carriage return trigger and applies RFC 4180 quotes');
  assert(escapeCsvField('- Depreciation, Amortization') === "\"- Depreciation, Amortization\"".replace('-', "'-"), 'Prefixes trigger and quotes for commas');
  assert(escapeCsvField('=cmd|" /C calc"!A0') === "\"=cmd|\"\" /C calc\"\"!A0\"".replace('=', "'="), 'Prefixes trigger and doubles internal quotes');
  assert(escapeCsvField(-10) === '-10', 'Does not prefix numeric negative numbers');
  assert(escapeCsvField(10) === '10', 'Handles positive numbers');
  assert(escapeCsvField(0) === '0', 'Handles 0');
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
  assert(rows[2][5] === 'none', 'Unmapped row has source none');
  assert(rows[2][6] === '', 'Unmapped row has empty confidence');

  // Test manual mapping
  const manualMapping = [
    {
      sheet: 'IS',
      rowIndex: 1,
      rawLabel: 'Custom Item',
      parameterId: 'custom_param',
      source: 'manual',
      confidence: null,
    },
  ];
  const manualCsv = buildMappingCsv(manualMapping, 'model.xlsx');
  const manualRows = parseCsvRows(manualCsv);
  assert(manualRows[1][5] === 'manual', 'Manual source is preserved');
  assert(manualRows[1][6] === '', 'Manual mapping confidence column is empty');
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
      source: 'taxonomy',
    },
    {
      sheet: 'IS',
      rawLabel: 'Skipped Row',
      normLabel: 'skipped row',
      parameterId: null, // should NOT be appended
      source: 'none',
    },
    {
      sheet: 'IS',
      rawLabel: 'Old Label',
      normLabel: 'old label',
      parameterId: 'revenue', // Duplicate of existing in tpl_1!
      source: 'manual',
    },
    {
      sheet: 'IS',
      rawLabel: 'History Row',
      normLabel: 'history row',
      parameterId: 'ppe',
      source: 'history', // Source history should be skipped!
    },
  ];

  const csv = buildUpdatedHistoryCsv(existingHistory, newMappings, {
    templateId: 'tpl_1',
    mappedBy: 'analyst99',
    mappedAt: '2025-03-01T12:00:00Z',
  });

  const rows = parseCsvRows(csv);
  assert(rows[0].join(',') === 'template_id,sheet,row_label,normalized_label,parameter_id,mapped_by,mapped_at', 'Exact history header');
  assert(rows.length === 3, 'Includes existing record and 1 newly accepted record (skipped duplicates and history source)');
  assert(rows[2][0] === 'tpl_1' && rows[2][4] === 'cogs' && rows[2][5] === 'analyst99', 'Appended new record with correct metadata');

  // Second export with no changes adds no lines
  const parsedRecords = rows.slice(1).map(r => ({
    templateId: r[0],
    sheet: r[1],
    rowLabel: r[2],
    normLabel: r[3],
    parameterId: r[4],
    mappedBy: r[5],
    mappedAt: r[6],
  }));
  const csv2 = buildUpdatedHistoryCsv(parsedRecords, newMappings, {
    templateId: 'tpl_1',
    mappedBy: 'analyst99',
    mappedAt: '2025-03-01T12:00:00Z',
  });
  const rows2 = parseCsvRows(csv2);
  assert(rows2.length === rows.length, 'Second export with no changes adds no new lines');

  // Verify deduplication handles casing and trimming
  const csvWhitespace = buildUpdatedHistoryCsv(parsedRecords, [
    {
      sheet: ' is ',
      rawLabel: 'New Label',
      normLabel: 'new label',
      parameterId: 'COGS',
      source: 'manual',
    },
  ], {
    templateId: ' tpl_1 ',
  });
  const rowsWhitespace = parseCsvRows(csvWhitespace);
  assert(rowsWhitespace.length === rows.length, 'Deduplicates when casing or whitespace differs');

  // Verify deduplication does not collide when boundaries shift across fields
  const collisionHistory = [
    {
      templateId: 'ab',
      sheet: 'c',
      normLabel: 'x',
      parameterId: 'y',
      rowLabel: 'X',
      mappedBy: 'analyst',
      mappedAt: '2025-01-01',
    },
    {
      templateId: 'a',
      sheet: 'sheet_a',
      normLabel: 'bc',
      parameterId: 'param',
      rowLabel: 'BC',
      mappedBy: 'analyst',
      mappedAt: '2025-01-01',
    },
    {
      templateId: 'a',
      sheet: 'sheet_1',
      normLabel: 'foo_bar',
      parameterId: 'baz',
      rowLabel: 'Foo',
      mappedBy: 'analyst',
      mappedAt: '2025-01-01',
    },
    {
      templateId: 'a',
      sheet: '',
      normLabel: 'test',
      parameterId: 'p',
      rowLabel: 'Test',
      mappedBy: 'analyst',
      mappedAt: '2025-01-01',
    },
  ];
  const collisionMappings = [
    {
      sheet: 'bc',
      rawLabel: 'X',
      normLabel: 'x',
      parameterId: 'y',
      source: 'manual',
    },
    {
      sheet: 'sheet_ab',
      rawLabel: 'C',
      normLabel: 'c',
      parameterId: 'param',
      source: 'manual',
    },
    {
      sheet: 'sheet_1',
      rawLabel: 'Foo',
      normLabel: 'foo',
      parameterId: 'bar_baz',
      source: 'manual',
    },
    {
      sheet: 'test',
      rawLabel: 'Empty Sheet Shift',
      normLabel: '',
      parameterId: 'p',
      source: 'manual',
    },
  ];
  const collisionCsv = buildUpdatedHistoryCsv(collisionHistory, collisionMappings, {
    templateId: 'a',
  });
  const collisionRows = parseCsvRows(collisionCsv);
  assert(
    collisionRows.length === 9,
    'Does not falsely deduplicate when boundary characters shift across fields (all 4 field boundary permutations)'
  );

  // Verify history export does not drop rows that have no source property
  const noSourceMappings = [
    {
      sheet: 'IS',
      rawLabel: 'No Source Row',
      normLabel: 'no source row',
      parameterId: 'operating_expenses',
      // source is deliberately omitted / undefined
    },
  ];
  const noSourceCsv = buildUpdatedHistoryCsv([], noSourceMappings, {
    templateId: 'tpl_nosrc',
  });
  const noSourceRows = parseCsvRows(noSourceCsv);
  assert(
    noSourceRows.length === 2 && noSourceRows[1][4] === 'operating_expenses',
    'History export includes rows with no source property'
  );
}

console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
