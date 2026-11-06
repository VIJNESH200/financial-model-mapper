/**
 * @fileoverview Unit tests for excelReader.js using a mock SheetJS engine.
 */

import { getSheetNames, readSheetRows } from '../src/excelReader.js';

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

// Minimal mock of SheetJS reader
const mockXlsx = {
  read(buffer, options) {
    if (options.bookSheets) {
      return { SheetNames: ['IS', 'BS', 'CF'] };
    }
    const sheetName = options.sheets;
    if (sheetName === 'IS') {
      return {
        SheetNames: ['IS'],
        Sheets: {
          IS: {
            '!ref': 'A1:C5',
            A1: { t: 's', v: 'Company Financial Model' },
            // Row 2 is completely empty
            A3: { t: 's', v: 'Revenue' },
            B3: { t: 'n', v: 1000 },
            C3: { t: 'n', v: 1200 },
            A4: { t: 's', v: 'Cost of Goods Sold' },
            B4: { t: 'n', v: -400 },
            C4: { t: 'n', v: -450 },
            // Row 5 has only numbers, no text label
            B5: { t: 'n', v: 600 },
            C5: { t: 'n', v: 750 },
          },
        },
      };
    }
    return { SheetNames: [sheetName], Sheets: {} };
  },
  utils: {
    decode_range(ref) {
      return { s: { r: 0, c: 0 }, e: { r: 4, c: 2 } };
    },
    encode_cell(cellObj) {
      const colLetter = String.fromCharCode(65 + cellObj.c);
      return `${colLetter}${cellObj.r + 1}`;
    },
    decode_cell(address) {
      const match = address.match(/^([A-Z]+)(\d+)$/);
      if (!match) return { r: 0, c: 0 };
      const colLetter = match[1];
      const rowNum = parseInt(match[2], 10);
      return { r: rowNum - 1, c: colLetter.charCodeAt(0) - 65 };
    },
  },
};

console.log('--- Testing excelReader.js ---');

{
  const names = getSheetNames(new ArrayBuffer(10), mockXlsx);
  assert(names.length === 3, 'Returns 3 sheet names');
  assert(names[0] === 'IS' && names[1] === 'BS' && names[2] === 'CF', 'Correct sheet names');
}

{
  let progressUpdates = 0;
  const rows = await readSheetRows(new ArrayBuffer(10), 'IS', {
    xlsx: mockXlsx,
    onProgress(p) {
      progressUpdates += 1;
    },
  });

  assert(rows.length === 3, 'Extracted 3 valid rows (skipped row 2 empty and row 5 pure numbers)');
  assert(rows[0].rowIndex === 1 && rows[0].rawLabel === 'Company Financial Model', 'Row 1 title parsed');
  assert(rows[1].rowIndex === 3 && rows[1].rawLabel === 'Revenue' && rows[1].normLabel === 'revenue', 'Row 3 Revenue parsed');
  assert(rows[2].rowIndex === 4 && rows[2].rawLabel === 'Cost of Goods Sold' && rows[2].normLabel === 'cost of goods sold', 'Row 4 COGS parsed');
  assert(progressUpdates > 0, 'onProgress was called');
}

// Integration test with real SheetJS library if online
try {
  const response = await fetch('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
  if (response.ok) {
    const script = await response.text();
    const vm = await import('vm');
    const context = {};
    vm.runInNewContext(script, context);
    const realXlsx = context.XLSX;

    const wb = realXlsx.utils.book_new();
    const ws = {
      '!ref': 'A1:C5000',
      A1: { t: 's', v: 'Acme Corp Model' },
      A3: { t: 'str', v: 'Gross Revenue' },
      B3: { t: 'n', v: 1000 },
      A4: { t: 's', v: 'Cost of Goods Sold' },
      B4: { t: 'n', v: -400 },
    };
    realXlsx.utils.book_append_sheet(wb, ws, 'IS');
    const buf = realXlsx.write(wb, { type: 'array', bookType: 'xlsx' });

    const liveNames = getSheetNames(buf, realXlsx);
    assert(liveNames.length === 1 && liveNames[0] === 'IS', 'Real SheetJS: getSheetNames parsed live workbook');

    const liveRows = await readSheetRows(buf, 'IS', { xlsx: realXlsx });
    assert(liveRows.length === 3, 'Real SheetJS: extracted 3 rows from inflated 5000-row range');
    assert(liveRows[1].rawLabel === 'Gross Revenue', 'Real SheetJS: recognized formula string cell (t: "str")');
  }
} catch (networkError) {
  console.log('Skipping live SheetJS fetch (offline or sandboxed):', networkError.message);
}

console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);
if (failed > 0) {
  process.exit(1);
}
