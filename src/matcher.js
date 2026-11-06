/**
 * @fileoverview Pure matching engine that suggests standardised parameters for model rows.
 */

import { buildAliasLookup } from './taxonomy.js';

const CONFIDENCE_LEVELS = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Compares two ISO date strings or Date values to find the most recent.
 * @param {string} dateA First timestamp.
 * @param {string} dateB Second timestamp.
 * @return {number} Negative if dateA is newer, positive if dateB is newer, 0 if equal.
 */
function compareRecentDates(dateA, dateB) {
  const timeA = Date.parse(dateA) || 0;
  const timeB = Date.parse(dateB) || 0;
  return timeB - timeA;
}

/**
 * Finds matching history records for a row based on sheet and normalised label.
 * @param {Object} row Internal row object.
 * @param {Array<Object>} history List of internal history records.
 * @param {boolean} useSheetContext Whether matching requires matching the sheet name.
 * @return {Array<Object>} Matching history records sorted by most recent first.
 */
function findHistoryLabelMatches(row, history, useSheetContext) {
  const rowSheet = (row.sheet || '').trim().toLowerCase();
  const matches = history.filter(record => {
    const labelMatch = record.normLabel === row.normLabel;
    if (!labelMatch) {
      return false;
    }
    const recordSheet = (record.sheet || '').trim().toLowerCase();
    return useSheetContext ? recordSheet === rowSheet : true;
  });

  return matches.sort((a, b) => compareRecentDates(a.mappedAt, b.mappedAt));
}

/**
 * Finds history records that match the row's sheet and position with a differing label.
 * @param {Object} row Internal row object.
 * @param {Array<Object>} history List of internal history records.
 * @return {Array<Object>} Position-matched records sorted by most recent first.
 */
function findPositionMatches(row, history) {
  // TODO: History CSV specification lacks explicit row_index; matching relies on
  // explicit or sequential rowIndex recorded during history parsing.
  const rowSheet = (row.sheet || '').trim().toLowerCase();
  const matches = history.filter(record => {
    const recordSheet = (record.sheet || '').trim().toLowerCase();
    const positionMatch = recordSheet === rowSheet && record.rowIndex === row.rowIndex;
    const labelDiffers = record.normLabel !== row.normLabel;
    return positionMatch && labelDiffers;
  });

  return matches.sort((a, b) => compareRecentDates(a.mappedAt, b.mappedAt));
}

/**
 * Evaluates whether multiple matching records introduce conflicting parameter IDs.
 * @param {Array<Object>} records Matched records.
 * @return {{hasConflict: boolean, conflicts: string[]}} Conflict details.
 */
function detectConflicts(records) {
  const uniqueParams = Array.from(new Set(records.map(r => r.parameterId)));
  const hasConflict = uniqueParams.length > 1;
  return { hasConflict, conflicts: hasConflict ? uniqueParams : [] };
}

/**
 * Attempts to resolve suggestion from history label matches.
 * @param {Object} row Model row.
 * @param {Array<Object>} history History records.
 * @param {boolean} useSheet Whether to match sheet name.
 * @return {Object|null} Suggestion or null if no match.
 */
function tryHistoryMatch(row, history, useSheet) {
  const matches = findHistoryLabelMatches(row, history, useSheet);
  if (matches.length === 0) {
    return null;
  }
  const winner = matches[0];
  const { hasConflict, conflicts } = detectConflicts(matches);
  return {
    parameterId: winner.parameterId,
    confidence: 'high',
    source: 'history',
    hasConflict,
    conflicts,
    matchedRecord: winner,
  };
}

/**
 * Attempts to resolve suggestion from taxonomy alias match.
 * @param {Object} row Model row.
 * @param {Map<string, Object[]>} aliasLookup Pre-indexed alias map.
 * @return {Object|null} Suggestion or null if no match.
 */
function tryTaxonomyMatch(row, aliasLookup) {
  const matches = aliasLookup.get(row.normLabel) || [];
  if (matches.length === 0) {
    return null;
  }
  const winner = matches[0];
  const { hasConflict, conflicts } = detectConflicts(matches.map(t => ({ parameterId: t.id })));
  return {
    parameterId: winner.id,
    confidence: 'medium',
    source: 'taxonomy',
    hasConflict,
    conflicts,
    matchedRecord: winner,
  };
}

/**
 * Attempts to resolve suggestion from sheet position tiebreaker.
 * @param {Object} row Model row.
 * @param {Array<Object>} history History records.
 * @return {Object|null} Suggestion or null if no match.
 */
function tryPositionMatch(row, history) {
  const matches = findPositionMatches(row, history);
  if (matches.length === 0) {
    return null;
  }
  const winner = matches[0];
  const { hasConflict, conflicts } = detectConflicts(matches);
  return {
    parameterId: winner.parameterId,
    confidence: 'low',
    source: 'position',
    hasConflict,
    conflicts,
    matchedRecord: winner,
  };
}

/**
 * Suggests a standardised parameter mapping for a single row.
 * Pure function with no DOM dependencies.
 * @param {Object} row The model row { sheet, rowIndex, rawLabel, normLabel }.
 * @param {Object} context Matching context.
 * @param {Array<Object>} [context.history] Historical mapping records.
 * @param {Object} [context.taxonomy] Standardised parameter taxonomy.
 * @param {Map<string, Object[]>} [context.aliasLookup] Pre-indexed alias lookup map.
 * @param {Object} [context.settings] Matching settings.
 * @return {Object} Suggestion result with parameterId, confidence, source, and conflict status.
 */
export function matchRow(row, context = {}) {
  const {
    history = [],
    taxonomy = null,
    settings = {},
    aliasLookup = taxonomy ? buildAliasLookup(taxonomy, settings.normalisation) : new Map(),
  } = context;

  const useSheet = settings.useSheetContext !== false;
  const usePosition = settings.usePositionTiebreaker === true;
  const minConfidence = settings.minimumConfidence || 'low';
  const minRank = CONFIDENCE_LEVELS[minConfidence] ?? CONFIDENCE_LEVELS.low;

  // 1. History sheet + label match -> 2. Taxonomy alias match -> 3. Position tiebreaker
  let suggestion = tryHistoryMatch(row, history, useSheet);
  if (!suggestion) {
    suggestion = tryTaxonomyMatch(row, aliasLookup);
  }
  if (!suggestion && usePosition) {
    suggestion = tryPositionMatch(row, history);
  }

  // 4. No match or confidence below threshold
  const currentRank = suggestion ? (CONFIDENCE_LEVELS[suggestion.confidence] ?? 0) : 0;
  if (!suggestion || currentRank < minRank) {
    return {
      parameterId: null,
      confidence: null,
      source: 'none',
      hasConflict: false,
      conflicts: [],
      matchedRecord: null,
    };
  }

  return suggestion;
}

/**
 * Matches a list of model rows against history and taxonomy.
 * @param {Array<Object>} rows Array of model rows.
 * @param {Object} context Matching context.
 * @return {Array<Object>} Array of suggestion objects matching the input rows.
 */
export function matchRows(rows, context = {}) {
  const normalisationOpts = context.settings?.normalisation;
  const aliasLookup = context.aliasLookup ||
    (context.taxonomy ? buildAliasLookup(context.taxonomy, normalisationOpts) : new Map());
  const resolvedContext = { ...context, aliasLookup };

  return rows.map(row => matchRow(row, resolvedContext));
}
