/**
 * @fileoverview Unit tests for matcher.js pure matching engine.
 */

import { matchRow } from '../src/matcher.js';
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
  },
  {
    templateId: 'tpl_2',
    sheet: 'IS',
    rowLabel: 'Net Sales',
    normLabel: 'net sales',
    parameterId: 'revenue_legacy',
    mappedBy: 'analyst2',
    mappedAt: '2025-02-01T10:00:00Z', // Newer!
  },
  {
    templateId: 'tpl_3',
    sheet: 'IS',
    rowLabel: 'Old Cost Row',
    normLabel: 'old cost row',
    parameterId: 'cogs',
    mappedBy: 'analyst1',
    mappedAt: '2025-01-05T10:00:00Z',
  },
  {
    templateId: 'tpl_4',
    sheet: 'BS',
    rowLabel: 'Cash',
    normLabel: 'cash',
    parameterId: 'cash_and_equivalents',
    mappedBy: 'analyst3',
    mappedAt: '2025-01-05T10:00:00Z',
  },
];

console.log('--- Running Matcher Engine Unit Tests ---');

// Test 1: Priority 1 - History sheet + normLabel match (High confidence, un-scoped template)
{
  const row = { sheet: 'IS', rowIndex: 5, rawLabel: 'Net Sales', normLabel: 'net sales' };
  const result = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, minimumConfidence: 'low' },
  });

  assert(result.source === 'history', 'Source is history');
  assert(result.confidence === 'high', 'Confidence is high');
  assert(result.parameterId === 'revenue_legacy', 'Prefers most recent mapped_at (2025-02-01)');
  assert(result.hasConflict === true, 'Detects conflict between differing parameter IDs across templates');
  assert(result.conflicts.includes('revenue') && result.conflicts.includes('revenue_legacy'), 'Conflict lists all IDs');
}

// Test 2: Priority 1 - Scoping history matches to active templateId (Change 2)
{
  const row = { sheet: 'IS', rowIndex: 5, rawLabel: 'Net Sales', normLabel: 'net sales' };

  // Scope to tpl_1
  const tpl1Result = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    templateId: 'tpl_1',
    settings: { useSheetContext: true, minimumConfidence: 'low' },
  });
  assert(tpl1Result.source === 'history', 'Matches history for scoped template tpl_1');
  assert(tpl1Result.parameterId === 'revenue', 'Matches parameter from tpl_1');
  assert(tpl1Result.hasConflict === false, 'No conflict when scoped to single template');

  // Scope to nonexistent template: falls back to taxonomy
  const nonExistentResult = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    templateId: 'tpl_nonexistent',
    settings: { useSheetContext: true, minimumConfidence: 'low' },
  });
  assert(nonExistentResult.source === 'taxonomy', 'Falls back to taxonomy when templateId not in history');
  assert(nonExistentResult.confidence === 'medium', 'Confidence is medium for taxonomy fallback');
}

// Test 3: Priority 2 - Taxonomy alias match (Medium confidence)
{
  const row = { sheet: 'IS', rowIndex: 20, rawLabel: 'Total Revenue', normLabel: 'total revenue' };
  const result = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, minimumConfidence: 'low' },
  });

  assert(result.source === 'taxonomy', 'Source is taxonomy when not in history');
  assert(result.confidence === 'medium', 'Confidence is medium for taxonomy');
  assert(result.parameterId === 'revenue', 'Matches taxonomy parameter id revenue');
  assert(result.hasConflict === false, 'No conflict on unique taxonomy alias');
}

// Test 4: Priority 3 - No match
{
  const row = { sheet: 'IS', rowIndex: 99, rawLabel: 'Unrelated Row', normLabel: 'unrelated row' };
  const result = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, minimumConfidence: 'low' },
  });

  assert(result.source === 'none', 'No match gives source none');
  assert(result.confidence === null, 'No match gives null confidence');
  assert(result.parameterId === null, 'No match gives null parameterId');
}

// Test 5: Minimum confidence filter threshold
{
  // Taxonomy match has medium confidence; if minimumConfidence is high, drops to none
  const row = { sheet: 'IS', rowIndex: 20, rawLabel: 'Total Revenue', normLabel: 'total revenue' };
  const result = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, minimumConfidence: 'high' },
  });

  assert(result.source === 'none', 'Drops medium confidence when minimumConfidence is high');
  assert(result.parameterId === null, 'Parameter is null when filtered by threshold');
}

// Test 6: Sheet context matching
{
  // Row on sheet 'IS', but history record for 'cash' is on sheet 'BS'
  const row = { sheet: 'IS', rowIndex: 10, rawLabel: 'Cash', normLabel: 'cash' };
  const withSheetContext = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true },
  });
  assert(withSheetContext.source === 'none', 'Sheet mismatch yields no history match with useSheetContext: true');

  const withoutSheetContext = matchRow(row, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: false },
  });
  assert(withoutSheetContext.source === 'history', 'Matches history when useSheetContext is false');
  assert(withoutSheetContext.parameterId === 'cash_and_equivalents', 'Maps to cash_and_equivalents');
}

// Test 7: Case-insensitive sheet name matching
{
  const rowLowerSheet = { sheet: 'is', rowIndex: 5, rawLabel: 'Net Sales', normLabel: 'net sales' };
  const result = matchRow(rowLowerSheet, {
    history: sampleHistory,
    taxonomy: sampleTaxonomy,
    settings: { useSheetContext: true, minimumConfidence: 'low' },
  });
  assert(result.source === 'history', 'Matches history when sheet case differs (is vs IS)');
  assert(result.parameterId === 'revenue_legacy', 'Retrieves correct parameter regardless of sheet casing');
}

console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
