/**
 * @fileoverview Builds and triggers downloads for mapping CSVs and updated history CSVs.
 */

const MAPPING_CSV_HEADER = [
  'model_file',
  'sheet',
  'row_index',
  'row_label',
  'parameter_id',
  'source',
  'confidence',
];

const HISTORY_CSV_HEADER = [
  'template_id',
  'sheet',
  'row_label',
  'normalized_label',
  'parameter_id',
  'mapped_by',
  'mapped_at',
];

const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Escapes a single CSV value according to RFC 4180 and sanitizes formula triggers.
 * Prefixes formula triggers (=, +, -, @, \t, \r) with a single quote to mitigate CWE-1236.
 * Wraps values with commas, quotes, or newlines in quotes and escapes internal quotes.
 * @param {unknown} value The raw cell value.
 * @return {string} Escaped string representation.
 */
export function escapeCsvField(value) {
  if (value === null || value === undefined) {
    return '';
  }
  let str = String(value);
  if (typeof value === 'string' && str.length > 0 && FORMULA_TRIGGERS.includes(str[0])) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats an array of token rows into a single CSV string.
 * @param {string[][]} rows 2D array of tokens.
 * @return {string} Valid CSV content with CRLF line breaks.
 */
function serializeCsvRows(rows) {
  return rows
    .map(row => row.map(field => escapeCsvField(field)).join(','))
    .join('\r\n');
}

/**
 * Builds the content of a mapping CSV export.
 * If a row has no assigned parameter, its source is written as 'none' and confidence is empty.
 * If a row was manually assigned, confidence is written as empty.
 * @param {Array<Object>} mappings Rows with mapping decisions.
 * @param {string} [modelFileName] Name of the original Excel file.
 * @return {string} CSV text.
 */
export function buildMappingCsv(mappings, modelFileName = '') {
  const dataRows = mappings.map(item => {
    const hasAssignment = Boolean(item.parameterId);
    const source = hasAssignment ? (item.source || 'none') : 'none';
    const confidence = (hasAssignment && source !== 'manual') ? (item.confidence ?? '') : '';

    return [
      modelFileName,
      item.sheet ?? '',
      item.rowIndex ?? '',
      item.rawLabel ?? '',
      item.parameterId ?? '',
      source,
      confidence,
    ];
  });

  return serializeCsvRows([MAPPING_CSV_HEADER, ...dataRows]);
}

/**
 * Computes the unique deduplication key for a history entry:
 * templateId + sheet + normLabel + parameterId normalised to lowercase and trimmed,
 * delimited by the non-printable \u0001 character to prevent boundary collision.
 * @param {string} templateId Template identifier.
 * @param {string} sheet Sheet name.
 * @param {string} normLabel Normalised line item label.
 * @param {string} parameterId Assigned parameter ID.
 * @return {string} Normalised composite deduplication key.
 */
function buildHistoryKey(templateId, sheet, normLabel, parameterId) {
  const norm = str => String(str ?? '').trim().toLowerCase();
  return [templateId, sheet, normLabel, parameterId].map(norm).join('\u0001');
}

/**
 * Appends new non-history mappings to history CSV rows, avoiding duplicates.
 * @param {Array<Object>} newMappings Newly accepted mappings.
 * @param {Set<string>} existingKeys Keys of existing history entries.
 * @param {Object} meta Metadata for new records.
 * @param {string[][]} rows Array of CSV rows to append to.
 */
function appendNewMappings(newMappings, existingKeys, meta, rows) {
  newMappings
    .filter(mapping => Boolean(mapping.parameterId) && mapping.source !== 'history')
    .forEach(mapping => {
      const key = buildHistoryKey(
        meta.templateId,
        mapping.sheet,
        mapping.normLabel,
        mapping.parameterId
      );
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        rows.push([
          meta.templateId,
          mapping.sheet ?? '',
          mapping.rawLabel ?? '',
          mapping.normLabel ?? '',
          mapping.parameterId,
          meta.mappedBy,
          meta.mappedAt,
        ]);
      }
    });
}

/**
 * Builds updated history CSV content by appending newly accepted mappings.
 * Prevents duplicate mappings by maintaining a Set of composite keys
 * (templateId + sheet + normLabel + parameterId joined by \u0001, lowercased and trimmed) across existing
 * and newly appended records, and skips mappings whose source is already 'history'.
 * @param {Array<Object>} existingRecords Existing history records.
 * @param {Array<Object>} newMappings Newly accepted mappings.
 * @param {Object} [options] Metadata options.
 * @param {string} [options.templateId] Template identifier for the new records.
 * @param {string} [options.mappedBy] Identifier of the analyst performing the mapping.
 * @param {string} [options.mappedAt] ISO timestamp for new records.
 * @return {string} Full history CSV content.
 */
export function buildUpdatedHistoryCsv(existingRecords = [], newMappings = [], options = {}) {
  const meta = {
    mappedBy: options.mappedBy || 'analyst',
    mappedAt: options.mappedAt || new Date().toISOString(),
    templateId: options.templateId || 'imported_model',
  };

  const rows = [HISTORY_CSV_HEADER];
  const existingKeys = new Set();

  existingRecords.forEach(record => {
    existingKeys.add(
      buildHistoryKey(
        record.templateId,
        record.sheet,
        record.normLabel,
        record.parameterId
      )
    );
    rows.push([
      record.templateId ?? '',
      record.sheet ?? '',
      record.rowLabel ?? '',
      record.normLabel ?? '',
      record.parameterId ?? '',
      record.mappedBy ?? '',
      record.mappedAt ?? '',
    ]);
  });

  appendNewMappings(newMappings, existingKeys, meta, rows);
  return serializeCsvRows(rows);
}

/**
 * Initiates a browser download of a CSV file.
 * @param {string} filename Desired download filename.
 * @param {string} csvContent Raw CSV text content.
 */
export function triggerCsvDownload(filename, csvContent) {
  if (typeof window === 'undefined' || !window.document) {
    return;
  }
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
