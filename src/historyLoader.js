/**
 * @fileoverview Parses history CSV files into the standardised internal history format.
 */

import { normaliseLabel } from './normalise.js';

const EXPECTED_COLUMNS = [
  'template_id',
  'sheet',
  'row_label',
  'normalized_label',
  'parameter_id',
  'mapped_by',
  'mapped_at',
];

/**
 * Appends a parsed CSV row to the collection if it contains non-empty content.
 * @param {string[][]} rows Collected rows array.
 * @param {string[]} currentRow Fields parsed in the current line.
 * @param {string} lastField Final field of the current row.
 */
function commitRow(rows, currentRow, lastField) {
  currentRow.push(lastField);
  if (currentRow.some(field => field.trim() !== '')) {
    rows.push(currentRow);
  }
}

/**
 * Parses raw CSV text into a 2D array of trimmed string tokens.
 * Handles quoted cells, escaped quotes (""), and commas or newlines inside quotes.
 * @param {string} csvText Raw CSV string.
 * @return {string[][]} Array of row token arrays.
 */
export function parseCsvRows(csvText) {
  if (!csvText) {
    return [];
  }

  const text = csvText.startsWith('\uFEFF') ? csvText.slice(1) : csvText;
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (insideQuotes && text[i + 1] === '"') {
        currentField += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      commitRow(rows, currentRow, currentField);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField !== '' || currentRow.length > 0) {
    commitRow(rows, currentRow, currentField);
  }

  return rows;
}

/**
 * Validates header columns against the strict expected history specification.
 * @param {string[]} headerRow The first row of the CSV file.
 * @return {{valid: boolean, error?: string, columnMap: Map<string, number>}}
 */
function validateHistoryHeader(headerRow) {
  const columnMap = new Map();
  const normalized = headerRow.map(h => h.trim().toLowerCase());

  EXPECTED_COLUMNS.forEach(col => {
    columnMap.set(col, normalized.indexOf(col));
  });

  const missing = EXPECTED_COLUMNS.filter(col => columnMap.get(col) === -1);
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required history columns: ${missing.join(', ')}`,
      columnMap,
    };
  }

  return { valid: true, columnMap };
}

/**
 * Builds an internal history record from CSV tokens.
 * @param {string[]} row CSV row cells.
 * @param {Map<string, number>} columnMap Column name to index map.
 * @param {Object} [normalisationOptions] Options for normalisation.
 * @return {Object|null} Built record or null if invalid.
 */
function buildHistoryRecord(row, columnMap, normalisationOptions) {
  const templateId = (row[columnMap.get('template_id')] || '').trim();
  const sheet = (row[columnMap.get('sheet')] || '').trim();
  const rowLabel = (row[columnMap.get('row_label')] || '').trim();
  let normLabel = (row[columnMap.get('normalized_label')] || '').trim();
  const parameterId = (row[columnMap.get('parameter_id')] || '').trim();
  const mappedBy = (row[columnMap.get('mapped_by')] || '').trim();
  const mappedAt = (row[columnMap.get('mapped_at')] || '').trim();

  if (!rowLabel || !parameterId) {
    return null;
  }
  normLabel = normaliseLabel(normLabel || rowLabel, normalisationOptions);

  return {
    templateId,
    sheet,
    rowLabel,
    normLabel,
    parameterId,
    mappedBy,
    mappedAt,
  };
}

/**
 * Parses history CSV content into typed internal history records.
 * @param {string} csvText Content of the history CSV file.
 * @param {Object} [normalisationOptions] Options to re-compute normLabel if missing.
 * @return {{records: Array<Object>, errors: string[]}} Parsed records and any non-fatal errors.
 */
export function parseHistoryCsv(csvText, normalisationOptions) {
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) {
    return { records: [], errors: ['History CSV is empty.'] };
  }

  const headerValidation = validateHistoryHeader(rows[0]);
  if (!headerValidation.valid) {
    return { records: [], errors: [headerValidation.error || 'Invalid CSV header.'] };
  }

  const { columnMap } = headerValidation;
  const records = [];
  const errors = [];

  for (let lineIndex = 1; lineIndex < rows.length; lineIndex += 1) {
    const record = buildHistoryRecord(
      rows[lineIndex],
      columnMap,
      normalisationOptions
    );
    if (record) {
      records.push(record);
    } else {
      errors.push(`Row ${lineIndex + 1}: Skipped record due to missing row_label or parameter_id.`);
    }
  }

  return { records, errors };
}
