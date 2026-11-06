/**
 * @fileoverview Unit tests for matcher.js pure matching engine.
 */

import { matchRow, matchRows } from '../src/matcher.js';
import { buildAliasLookup } from '../src/taxonomy.js';

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

const sampleTaxonomy = {
  version: 1,
  parameters: [
    {
      id: 'revenue',
      displayName: 'Revenue',
      category: 'income_statement',
      aliases: ['Net Sales', 'Total Revenue', 'Sales'],
    },
    {
      id: 'cogs',
      displayName: 'Cost of Goods Sold',
      category: 'income_statement',
      aliases: ['Cost of Sales', 'COGS'],
    },
    {
      id: 'gross_profit',
      displayName: 'Gross Profit',
      category: 'income_statement',
      aliases: ['Gross Margin'],
    },
  ],
};

const sampleHistory = [
  {
    templateId: 'tpl_1',
    sheet: 'IS',
    rowLabel: 'Net Sales',
    normLabel: 'net sales',
    parameterId: 'revenue',
    mappedBy: 'analyst1',
    mappedAt: '2025-01-01T10:00:00Z',
    rowIndex: 5,
  },
  {
    templateId: 'tpl_2',
    sheet: 'IS',
    rowLabel: 'Net Sales',
    normLabel: 'net sales',
    parameterId: 'revenue_legacy',
    mappedBy: 'analyst2',
    mappedAt: '2025-02-01T10:00:00Z', // Newer!
    rowIndex: 5,
  },
  {
    templateId: 'tpl_3',
    sheet: 'IS',
    rowLabel: 'Old Cost Row',
    normLabel: 'old cost row',
    parameterId: 'cogs',
    mappedBy: 'analyst1',
    mappedAt: '2025-01-05T10:00:00Z',
    rowIndex: 8,
  },
  {
    templateId: 'tpl_4',
    sheet: 'BS',
    rowLabel: 'Cash',
    normLabel: 'cash',
    parameterId: 'cash_and_equivalents',
    mappedBy: 'analyst3',
    mappedAt: '2025-01-05T10:00:00Z',
    rowIndex: 10,
  },
];

console.log('--- Running Matcher Engine Unit Tests ---');

// Test 1: Priority 1 - History sheet + normLabel match (High confidence)
{
  const row = { sheet: 'IS', rowIndex: 5, rawLabel: 'Net Sales', normLabel: 'net sales' };
  const result = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, usePositionTiebreaker: true, minimumConfidence: 'low' },
  });

  assert(result.source === 'history', 'Source is history');
  assert(result.confidence === 'high', 'Confidence is high');
  assert(result.parameterId === 'revenue_legacy', 'Prefers most recent mapped_at (2025-02-01)');
  assert(result.hasConflict === true, 'Detects conflict between differing parameter IDs');
  assert(result.conflicts.includes('revenue') && result.conflicts.includes('revenue_legacy'), 'Conflict lists all IDs');
}

// Test 2: Priority 2 - Taxonomy alias match (Medium confidence)
{
  const row = { sheet: 'IS', rowIndex: 20, rawLabel: 'Total Revenue', normLabel: 'total revenue' };
  const result = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, usePositionTiebreaker: true, minimumConfidence: 'low' },
  });

  assert(result.source === 'taxonomy', 'Source is taxonomy when not in history');
  assert(result.confidence === 'medium', 'Confidence is medium for taxonomy');
  assert(result.parameterId === 'revenue', 'Matches taxonomy parameter id revenue');
  assert(result.hasConflict === false, 'No conflict on unique taxonomy alias');
}

// Test 3: Priority 3 - Position tiebreaker match (Low confidence)
{
  const row = { sheet: 'IS', rowIndex: 8, rawLabel: 'Manufacturing Cost', normLabel: 'manufacturing cost' };
  const result = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, usePositionTiebreaker: true, minimumConfidence: 'low' },
  });

  assert(result.source === 'position', 'Source is position when label differs but rowIndex & sheet match');
  assert(result.confidence === 'low', 'Confidence is low for position match');
  assert(result.parameterId === 'cogs', 'Parameter matches position history record');
}

// Test 4: Position tiebreaker disabled
{
  const row = { sheet: 'IS', rowIndex: 8, rawLabel: 'Manufacturing Cost', normLabel: 'manufacturing cost' };
  const result = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, usePositionTiebreaker: false, minimumConfidence: 'low' },
  });

  assert(result.source === 'none', 'Position match ignored when usePositionTiebreaker is false');
  assert(result.confidence === null, 'Confidence is null when no match');
  assert(result.parameterId === null, 'Parameter ID is null when no match');
}

// Test 5: Priority 4 - No match
{
  const row = { sheet: 'IS', rowIndex: 99, rawLabel: 'Unrelated Row', normLabel: 'unrelated row' };
  const result = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, usePositionTiebreaker: true, minimumConfidence: 'low' },
  });

  assert(result.source === 'none', 'No match gives source none');
  assert(result.confidence === null, 'No match gives null confidence');
  assert(result.parameterId === null, 'No match gives null parameterId');
}

// Test 6: Minimum confidence filter threshold
{
  // Position match has low confidence
  const row = { sheet: 'IS', rowIndex: 8, rawLabel: 'Manufacturing Cost', normLabel: 'manufacturing cost' };
  const result = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, usePositionTiebreaker: true, minimumConfidence: 'medium' },
  });

  assert(result.source === 'none', 'Drops low confidence when minimumConfidence is medium');
  assert(result.parameterId === null, 'Parameter is null when filtered by threshold');
}

// Test 7: Sheet context matching
{
  // Row on sheet 'IS', but history record for 'cash' is on sheet 'BS'
  const row = { sheet: 'IS', rowIndex: 10, rawLabel: 'Cash', normLabel: 'cash' };
  const withSheetContext = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, usePositionTiebreaker: false },
  });
  assert(withSheetContext.source === 'none', 'Sheet mismatch yields no history match with useSheetContext: true');

  const withoutSheetContext = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: false, usePositionTiebreaker: false },
  });
  assert(withoutSheetContext.source === 'history', 'Matches history when useSheetContext is false');
  assert(withoutSheetContext.parameterId === 'cash_and_equivalents', 'Maps to cash_and_equivalents');
}

// Test 8: Batch matchRows helper
{
  const rows = [
    { sheet: 'IS', rowIndex: 5, rawLabel: 'Net Sales', normLabel: 'net sales' },
    { sheet: 'IS', rowIndex: 20, rawLabel: 'Total Revenue', normLabel: 'total revenue' },
  ];
  const results = matchRows(rows, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, usePositionTiebreaker: true, minimumConfidence: 'low' },
  });

  assert(results.length === 2, 'Returns results for all rows');
  assert(results[0].source === 'history', 'First row matches history');
  assert(results[1].source === 'taxonomy', 'Second row matches taxonomy');
}

// Test 9: Case-insensitive sheet name matching
{
  const rowLowerSheet = { sheet: 'is', rowIndex: 5, rawLabel: 'Net Sales', normLabel: 'net sales' };
  const result = matchRow(rowLowerSheet, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, usePositionTiebreaker: true, minimumConfidence: 'low' },
  });
  assert(result.source === 'history', 'Matches history when sheet case differs (is vs IS)');
  assert(result.parameterId === 'revenue_legacy', 'Retrieves correct parameter regardless of sheet casing');

  const rowLowerPosition = { sheet: 'is', rowIndex: 8, rawLabel: 'Different Cost', normLabel: 'different cost' };
  const posResult = matchRow(rowLowerPosition, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, usePositionTiebreaker: true, minimumConfidence: 'low' },
  });
  assert(posResult.source === 'position', 'Position match works when sheet case differs (is vs IS)');
  assert(posResult.parameterId === 'cogs', 'Position tiebreaker finds correct parameter with case-insensitive sheet');
}

console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
