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

/**
 * Escapes a single CSV value according to RFC 4180.
 * Wraps values with commas, quotes, or newlines in quotes and escapes internal quotes.
 * @param {unknown} value The raw cell value.
 * @return {string} Escaped string representation.
 */
export function escapeCsvField(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
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
 * templateId + sheet + normLabel + parameterId normalised to lowercase and trimmed.
 * @param {string} templateId Template identifier.
 * @param {string} sheet Sheet name.
 * @param {string} normLabel Normalised line item label.
 * @param {string} parameterId Assigned parameter ID.
 * @return {string} Normalised composite deduplication key.
 */
function buildHistoryKey(templateId, sheet, normLabel, parameterId) {
  return `${templateId || ''}${sheet || ''}${normLabel || ''}${parameterId || ''}`
    .trim()
    .toLowerCase();
}

/**
 * Builds updated history CSV content by appending newly accepted mappings.
 * Prevents duplicate mappings by maintaining a Set of composite keys
 * (templateId + sheet + normLabel + parameterId, lowercased and trimmed) across existing
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
  const mappedBy = options.mappedBy || 'analyst';
  const mappedAt = options.mappedAt || new Date().toISOString();
  const templateId = options.templateId || 'imported_model';

  const rows = [HISTORY_CSV_HEADER];
  const existingKeys = new Set();

  // Include existing history records first and record their keys for deduplication
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

  // Append new mappings that have an assigned parameter and are not already in history
  newMappings
    .filter(mapping => Boolean(mapping.parameterId) && mapping.source !== 'history')
    .forEach(mapping => {
      const key = buildHistoryKey(
        templateId,
        mapping.sheet,
        mapping.normLabel,
        mapping.parameterId
      );
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        rows.push([
          templateId,
          mapping.sheet ?? '',
          mapping.rawLabel ?? '',
          mapping.normLabel ?? '',
          mapping.parameterId,
          mappedBy,
          mappedAt,
        ]);
      }
    });

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
