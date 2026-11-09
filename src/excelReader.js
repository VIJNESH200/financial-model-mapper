/**
 * @fileoverview Reads Excel workbooks and extracts sheet rows using SheetJS.
 */

import { normaliseLabel } from './normalise.js';

/**
 * Extracts available sheet names from an Excel workbook without parsing cell data.
 * @param {ArrayBuffer} arrayBuffer Raw file data.
 * @param {Object} [xlsxInstance] SheetJS library instance (defaults to global XLSX).
 * @return {string[]} Array of sheet names in workbook order.
 */
export function getSheetNames(arrayBuffer, xlsxInstance = globalThis.XLSX) {
  if (!xlsxInstance) {
    throw new Error('SheetJS (XLSX) library is not loaded.');
  }

  // bookSheets: true parses sheet names only, skipping heavy cell extraction.
  const workbook = xlsxInstance.read(arrayBuffer, { type: 'array', bookSheets: true });
  return workbook.SheetNames || [];
}

/**
 * Finds the primary row label from cells in an Excel row.
 * Scans columns from left to right and selects the first non-empty text value.
 * Caps column scanning to 25 columns to bound empty cell lookups on styled sheets.
 * @param {Object} worksheet SheetJS worksheet object.
 * @param {number} rowZeroIndexed 0-based row index.
 * @param {number} startCol 0-based starting column index.
 * @param {number} endCol 0-based ending column index.
 * @param {Object} xlsxInstance SheetJS library instance.
 * @return {string|null} Raw label string, or null if row has no textual label.
 */
function extractRowLabel(worksheet, rowZeroIndexed, startCol, endCol, xlsxInstance) {
  let fallbackLabel = null;
  const maxCol = Math.min(endCol, startCol + 25);

  for (let c = startCol; c <= maxCol; c += 1) {
    const cellAddress = xlsxInstance.utils.encode_cell({ r: rowZeroIndexed, c });
    const cell = worksheet[cellAddress];
    if (!cell || cell.v === undefined || cell.v === null) {
      continue;
    }

    if (cell.t === 'e') {
      continue;
    }

    const valueStr = String(cell.w ?? cell.v).trim();
    if (valueStr === '') {
      continue;
    }

    // A line item label must contain textual characters, not pure numbers or years.
    const hasText = /\p{L}/u.test(valueStr);
    const isStringCell = cell.t === 's' || cell.t === 'str';

    if (isStringCell && hasText) {
      return valueStr;
    }

    if (fallbackLabel === null && hasText) {
      fallbackLabel = valueStr;
    }
  }

  return fallbackLabel;
}

/**
 * Extracts and normalises a model row from a worksheet row index.
 * @param {Object} worksheet SheetJS worksheet object.
 * @param {number} rowZeroIndexed 0-based row index.
 * @param {Object} range Range bounds { s, e }.
 * @param {string} sheetName Sheet name.
 * @param {Object} xlsx SheetJS instance.
 * @param {Object} [normalisationOptions] Options for normalisation.
 * @return {Object|null} Extracted row object, or null if skipped.
 */
function processRow(worksheet, rowZeroIndexed, range, sheetName, xlsx, normalisationOptions) {
  const rawLabel = extractRowLabel(worksheet, rowZeroIndexed, range.s.c, range.e.c, xlsx);
  if (!rawLabel) {
    return null;
  }
  const normLabel = normaliseLabel(rawLabel, normalisationOptions);
  if (!normLabel) {
    return null;
  }
  return {
    sheet: sheetName,
    rowIndex: rowZeroIndexed + 1,
    rawLabel,
    normLabel,
  };
}

/**
 * Identifies sorted unique 0-based row indices that contain populated cells.
 * Skips fully empty rows early before scanning cell columns.
 * @param {Object} worksheet SheetJS worksheet object.
 * @param {Object} xlsx SheetJS instance.
 * @return {number[]} Sorted populated row indices.
 */
function getPopulatedRowIndices(worksheet, xlsx) {
  const rowSet = new Set();
  const keys = Object.keys(worksheet);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (key.charCodeAt(0) === 33) { // Skip '!' metadata properties
      continue;
    }
    const cell = xlsx.utils.decode_cell(key);
    rowSet.add(cell.r);
  }
  return Array.from(rowSet).sort((a, b) => a - b);
}

/**
 * Reads a single sheet from a workbook buffer and extracts non-empty model rows.
 * Skips fully empty rows early and yields to the UI thread periodically.
 * @param {ArrayBuffer} arrayBuffer Raw file data.
 * @param {string} sheetName Name of the sheet to parse.
 * @param {Object} [options] Parsing and normalisation options.
 * @param {Object} [options.xlsx] SheetJS library instance.
 * @param {Object} [options.normalisationOptions] Options for label normalisation.
 * @param {function(number): void} [options.onProgress] Progress reporting callback (0-100).
 * @return {Promise<Array<{sheet: string, rowIndex: number, rawLabel: string, normLabel: string}>>}
 */
export async function readSheetRows(arrayBuffer, sheetName, options = {}) {
  const xlsx = options.xlsx || globalThis.XLSX;
  if (!xlsx) {
    throw new Error('SheetJS (XLSX) library is not loaded.');
  }

  // Parse only the selected sheet to minimise memory and CPU load.
  const workbook = xlsx.read(arrayBuffer, { type: 'array', sheets: sheetName });
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet || !worksheet['!ref']) {
    return [];
  }

  const range = xlsx.utils.decode_range(worksheet['!ref']);
  const populatedRows = getPopulatedRowIndices(worksheet, xlsx);
  const totalRows = populatedRows.length;
  const rows = [];
  const chunkSize = 250;

  for (let i = 0; i < populatedRows.length; i += 1) {
    if (i % chunkSize === 0 && i > 0) {
      if (typeof options.onProgress === 'function') {
        options.onProgress(Math.round((i / totalRows) * 100));
      }
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const row = processRow(worksheet, populatedRows[i], range, sheetName, xlsx, options.normalisationOptions);
    if (row) {
      rows.push(row);
    }
  }

  if (typeof options.onProgress === 'function') {
    options.onProgress(100);
  }
  return rows;
}
