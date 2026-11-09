/**
 * @fileoverview Unit tests for normalise.js, historyLoader.js, and taxonomy.js.
 */

import { normaliseLabel } from '../src/normalise.js';
import { parseCsvRows, parseHistoryCsv } from '../src/historyLoader.js';
import { validateTaxonomy, parseTaxonomyJson, buildAliasLookup } from '../src/taxonomy.js';

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

console.log('--- Testing normalise.js ---');
{
  assert(normaliseLabel('  Net Sales  ') === 'net sales', 'Trims and lowercases');
  assert(normaliseLabel('Cost - of - Goods') === 'cost of goods', 'Replaces punctuation with space and collapses');
  assert(normaliseLabel('EBITDA (Adjusted)') === 'ebitda adjusted', 'Strips parentheses');
  assert(normaliseLabel('Revenue\t\n  2024') === 'revenue 2024', 'Collapses whitespace tabs and newlines');
  assert(normaliseLabel(null) === '', 'Handles null gracefully');
  assert(normaliseLabel(undefined) === '', 'Handles undefined gracefully');
}

console.log('--- Testing historyLoader.js CSV parsing ---');
{
  const simpleCsv = 'a,b,c\n1,2,3';
  const rows = parseCsvRows(simpleCsv);
  assert(rows.length === 2 && rows[1][1] === '2', 'Parses simple CSV');

  const quotedCsv = 'name,desc\n"Widget, Standard","Contains, commas, and ""quotes"""';
  const qRows = parseCsvRows(quotedCsv);
  assert(qRows.length === 2, 'Parses quoted rows');
  assert(qRows[1][0] === 'Widget, Standard', 'Handles commas in quotes');
  assert(qRows[1][1] === 'Contains, commas, and "quotes"', 'Handles escaped double quotes');

  const historyCsv = `template_id,sheet,row_label,normalized_label,parameter_id,mapped_by,mapped_at
tpl_1,IS,"Net Sales, Gross",net sales gross,revenue,analyst1,2025-01-01T00:00:00Z
tpl_1,IS,Cost of Goods Sold,,cogs,analyst1,2025-01-01T00:01:00Z
tpl_1,IS,Operating Expenses,OPERATING - EXPENSES (OPEX),opex,analyst1,2025-01-01T00:02:00Z`;

  const { records, errors } = parseHistoryCsv(historyCsv);
  assert(errors.length === 0, 'No errors parsing valid history');
  assert(records.length === 3, 'Parsed 3 records');
  assert(records[0].rowLabel === 'Net Sales, Gross', 'Parsed quoted row_label');
  assert(records[1].normLabel === 'cost of goods sold', 'Auto-computes normLabel when empty in CSV');
  assert(records[2].normLabel === 'operating expenses opex', 'Enforces normalisation on incoming un-normalised normalized_label');
  assert(records[0].rowIndex === undefined, 'History record does not have rowIndex');
  assert(records[1].rowIndex === undefined, 'History record does not have rowIndex');
}

console.log('--- Testing taxonomy.js ---');
{
  const validTax = {
    version: 1,
    parameters: [
      { id: 'rev', displayName: 'Revenue', category: 'is', aliases: ['Sales', 'Turnover'] },
    ],
  };
  assert(validateTaxonomy(validTax).valid === true, 'Valid taxonomy passes');
  assert(validateTaxonomy({}).valid === false, 'Empty taxonomy fails');
  assert(validateTaxonomy({ version: '1', parameters: [] }).valid === false, 'Non-numeric version fails');

  const lookup = buildAliasLookup(validTax);
  assert(lookup.has('revenue'), 'Lookup includes displayName');
  assert(lookup.has('sales'), 'Lookup includes alias "Sales"');
  assert(lookup.has('turnover'), 'Lookup includes alias "Turnover"');
}

console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
