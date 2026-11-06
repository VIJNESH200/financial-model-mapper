/**
 * @fileoverview Main application orchestrator wiring state, data loaders, and UI.
 */

import { parseTaxonomyJson, buildAliasLookup } from './taxonomy.js';
import { parseHistoryCsv } from './historyLoader.js';
import { getSheetNames, readSheetRows } from './excelReader.js';
import { matchRow } from './matcher.js';
import { buildMappingCsv, buildUpdatedHistoryCsv, triggerCsvDownload } from './exporter.js';
import {
  showBannerMessage,
  hideBannerMessage,
  updateFileProgress,
  populateSheetOptions,
  renderMappingTable,
  updateSummaryMetrics,
  toggleWorkspaceVisibility,
} from './ui.js';

/**
 * Global application session state.
 */
const state = {
  settings: {
    normalisation: {
      lowercase: true,
      trimWhitespace: true,
      collapseSpaces: true,
      stripPunctuation: true,
    },
    matching: {
      useSheetContext: true,
      minimumConfidence: 'low',
    },
  },
  defaultTaxonomy: null,
  activeTaxonomy: null,
  aliasLookup: new Map(),
  defaultHistory: [],
  activeHistory: [],
  modelFileName: '',
  workbookBuffer: null,
  sheetNames: [],
  currentSheet: '',
  sheetRowsMap: new Map(),
  rows: [],
  filter: 'all',
};

/**
 * Fetches JSON or text assets from relative project paths.
 * @param {string} url Resource path.
 * @return {Promise<string>} Text content of the resource.
 */
async function fetchAsset(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  return response.text();
}

/**
 * Loads default settings, taxonomy, and sample history on startup.
 */
async function initializeDefaults() {
  try {
    const [settingsText, taxonomyText, historyText] = await Promise.all([
      fetchAsset('config/settings.json'),
      fetchAsset('config/taxonomy.json'),
      fetchAsset('data/sample-history.csv'),
    ]);

    state.settings = JSON.parse(settingsText);

    const taxResult = parseTaxonomyJson(taxonomyText);
    if (!taxResult.taxonomy) {
      throw new Error(`Default taxonomy invalid: ${taxResult.errors.join(', ')}`);
    }
    state.defaultTaxonomy = taxResult.taxonomy;
    state.activeTaxonomy = taxResult.taxonomy;
    state.aliasLookup = buildAliasLookup(state.activeTaxonomy, state.settings.normalisation);

    const histResult = parseHistoryCsv(historyText, state.settings.normalisation);
    state.defaultHistory = histResult.records;
    state.activeHistory = histResult.records;

    updateConfigHints();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showBannerMessage(
      `Notice: Default assets could not be auto-loaded (${message}). If running directly from file://, start a local static server (e.g. npx serve or python -m http.server), or upload your taxonomy/history files manually.`,
      'info'
    );
  }
}

/**
 * Updates status text in configuration cards.
 */
function updateConfigHints() {
  const taxHint = document.getElementById('taxonomy-status');
  const histHint = document.getElementById('history-status');

  if (taxHint && state.activeTaxonomy) {
    taxHint.textContent = `Active taxonomy: ${state.activeTaxonomy.parameters?.length || 0} parameters`;
  }
  if (histHint) {
    histHint.textContent = `Active history: ${state.activeHistory.length} mappings loaded`;
  }
}

/**
 * Assembles the standard matching context including the active template ID.
 * @return {Object} Context object for matchRow.
 */
function getMatchingContext() {
  const templateInput = /** @type {HTMLInputElement|null} */ (
    document.getElementById('template-id-input')
  );
  const templateId = templateInput?.value.trim() || null;
  return {
    history: state.activeHistory,
    taxonomy: state.activeTaxonomy,
    aliasLookup: state.aliasLookup,
    settings: state.settings.matching,
    templateId,
  };
}

/**
 * Runs matching engine on all rows across cached sheets and updates UI.
 */
function rematchAllSheets() {
  const matchingContext = getMatchingContext();

  for (const sheetRows of state.sheetRowsMap.values()) {
    sheetRows.forEach(item => {
      item.suggestion = matchRow(item, matchingContext);
    });
  }

  if (state.rows.length > 0) {
    refreshTableView();
  }
}

/**
 * Rerenders table and updates summary indicators.
 */
function refreshTableView() {
  renderMappingTable(
    state.rows,
    state.activeTaxonomy,
    state.filter,
    {
      onAccept: handleAcceptSuggestion,
      onAssign: handleAssignParameter,
      onClear: handleClearMapping,
    }
  );
  updateSummaryMetrics(state.rows);
}

/**
 * Handles accepting a row's suggested parameter.
 * @param {number} rowIndex 1-based Excel row index.
 */
function handleAcceptSuggestion(rowIndex) {
  const target = state.rows.find(r => r.rowIndex === rowIndex);
  if (target && target.suggestion?.parameterId) {
    target.assignedParameterId = target.suggestion.parameterId;
    target.source = target.suggestion.source;
    target.confidence = target.suggestion.confidence;
    refreshTableView();
  }
}

/**
 * Handles manually choosing a parameter from the dropdown.
 * @param {number} rowIndex 1-based Excel row index.
 * @param {string} parameterId Chosen parameter ID.
 */
function handleAssignParameter(rowIndex, parameterId) {
  const target = state.rows.find(r => r.rowIndex === rowIndex);
  if (!target) {
    return;
  }
  if (!parameterId) {
    target.assignedParameterId = null;
    target.source = 'none';
    target.confidence = null;
  } else if (target.suggestion?.parameterId === parameterId) {
    target.assignedParameterId = parameterId;
    target.source = target.suggestion.source;
    target.confidence = target.suggestion.confidence;
  } else {
    target.assignedParameterId = parameterId;
    target.source = 'manual';
    target.confidence = null;
  }
  refreshTableView();
}

/**
 * Handles clearing a row mapping.
 * @param {number} rowIndex 1-based Excel row index.
 */
function handleClearMapping(rowIndex) {
  const target = state.rows.find(r => r.rowIndex === rowIndex);
  if (target) {
    target.assignedParameterId = null;
    target.source = 'none';
    target.confidence = null;
    refreshTableView();
  }
}

/**
 * Reads and maps the chosen sheet from the workbook buffer.
 * @param {string} sheetName Name of the sheet to map.
 */
async function loadSheet(sheetName) {
  if (!state.workbookBuffer || !sheetName) {
    return;
  }

  state.currentSheet = sheetName;

  if (state.sheetRowsMap.has(sheetName)) {
    state.rows = state.sheetRowsMap.get(sheetName);
    toggleWorkspaceVisibility(true);
    refreshTableView();
    return;
  }

  updateFileProgress(10, `Parsing sheet "${sheetName}"...`, true);

  try {
    const rawRows = await readSheetRows(state.workbookBuffer, sheetName, {
      normalisationOptions: state.settings.normalisation,
      onProgress: percent => updateFileProgress(percent, `Parsing rows... ${percent}%`),
    });

    const matchingContext = getMatchingContext();

    const sheetRows = rawRows.map(row => ({
      ...row,
      suggestion: matchRow(row, matchingContext),
      assignedParameterId: null,
      source: 'none',
      confidence: null,
    }));

    state.sheetRowsMap.set(sheetName, sheetRows);
    state.rows = sheetRows;

    updateFileProgress(100, 'Complete', false);
    toggleWorkspaceVisibility(true);
    refreshTableView();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showBannerMessage(`Error reading sheet "${sheetName}": ${message}`, 'error');
    updateFileProgress(0, '', false);
  }
}

/**
 * Handles Excel file input selection.
 * @param {Event} event File input event.
 */
async function handleExcelUpload(event) {
  const target = /** @type {HTMLInputElement} */ (event.target);
  const file = target.files?.[0];
  if (!file) {
    return;
  }

  state.modelFileName = file.name;
  state.sheetRowsMap.clear();

  const infoEl = document.getElementById('model-file-info');
  if (infoEl) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(2);
    infoEl.textContent = `${file.name} (${sizeMb} MB)`;
  }

  const isLarge = file.size > 2 * 1024 * 1024;
  updateFileProgress(0, 'Reading file buffer...', isLarge);

  try {
    state.workbookBuffer = await file.arrayBuffer();
    state.sheetNames = getSheetNames(state.workbookBuffer);

    if (state.sheetNames.length === 0) {
      throw new Error('Workbook contains no sheets.');
    }

    populateSheetOptions(state.sheetNames, state.sheetNames[0]);
    await loadSheet(state.sheetNames[0]);
    showBannerMessage(`Loaded workbook "${file.name}" with ${state.sheetNames.length} sheet(s).`, 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showBannerMessage(`Failed to read Excel workbook: ${message}`, 'error');
  } finally {
    updateFileProgress(0, '', false);
  }
}

/**
 * Handles custom taxonomy JSON file upload.
 * @param {Event} event File input change event.
 */
async function handleTaxonomyUpload(event) {
  const target = /** @type {HTMLInputElement} */ (event.target);
  const file = target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const { taxonomy, errors } = parseTaxonomyJson(text);
    if (!taxonomy) {
      throw new Error(`Taxonomy validation failed:\n${errors.join('\n')}`);
    }

    state.activeTaxonomy = taxonomy;
    state.aliasLookup = buildAliasLookup(state.activeTaxonomy, state.settings.normalisation);
    updateConfigHints();
    rematchAllSheets();
    showBannerMessage(`Loaded custom taxonomy with ${taxonomy.parameters.length} parameters.`, 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showBannerMessage(`Taxonomy error: ${message}`, 'error');
  }
}

/**
 * Handles custom history CSV file upload.
 * @param {Event} event File input change event.
 */
async function handleHistoryUpload(event) {
  const target = /** @type {HTMLInputElement} */ (event.target);
  const file = target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const { records, errors } = parseHistoryCsv(text, state.settings.normalisation);
    if (records.length === 0 && errors.length > 0) {
      throw new Error(errors.join('\n'));
    }

    state.activeHistory = records;
    updateConfigHints();
    rematchAllSheets();
    showBannerMessage(`Loaded ${records.length} historical mapping records.`, 'success');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showBannerMessage(`History error: ${message}`, 'error');
  }
}

/**
 * Attaches event listeners for file uploads and resets.
 */
function wireUploadListeners() {
  document.getElementById('model-file-input')?.addEventListener('change', handleExcelUpload);

  document.getElementById('sheet-select')?.addEventListener('change', event => {
    const target = /** @type {HTMLSelectElement} */ (event.target);
    if (target.value) {
      loadSheet(target.value);
    }
  });

  document.getElementById('taxonomy-file-input')?.addEventListener('change', handleTaxonomyUpload);

  document.getElementById('btn-reset-taxonomy')?.addEventListener('click', () => {
    state.activeTaxonomy = state.defaultTaxonomy;
    state.aliasLookup = buildAliasLookup(state.activeTaxonomy, state.settings.normalisation);
    updateConfigHints();
    rematchAllSheets();
    showBannerMessage('Reset to bundled default taxonomy.', 'info');
  });

  document.getElementById('history-file-input')?.addEventListener('change', handleHistoryUpload);

  const templateIdInput = document.getElementById('template-id-input');
  templateIdInput?.addEventListener('input', () => {
    rematchAllSheets();
  });
  templateIdInput?.addEventListener('change', () => {
    rematchAllSheets();
  });

  document.getElementById('btn-reset-history')?.addEventListener('click', () => {
    state.activeHistory = state.defaultHistory;
    updateConfigHints();
    rematchAllSheets();
    showBannerMessage('Reset to bundled default history.', 'info');
  });
}

/**
 * Combines all rows across all mapped sheets in state.sheetRowsMap.
 * @return {Array<Object>} Combined row state objects.
 */
function getAllMappedRows() {
  const combined = [];
  for (const sheetRows of state.sheetRowsMap.values()) {
    combined.push(...sheetRows);
  }
  return combined.length > 0 ? combined : state.rows;
}

/**
 * Attaches event listeners for filtering and mapping actions.
 */
function wireWorkspaceListeners() {
  document.getElementById('filter-select')?.addEventListener('change', event => {
    const target = /** @type {HTMLSelectElement} */ (event.target);
    state.filter = target.value;
    refreshTableView();
  });

  document.getElementById('btn-accept-high')?.addEventListener('click', () => {
    let acceptedCount = 0;
    state.rows.forEach(r => {
      if (r.suggestion?.confidence === 'high' && r.suggestion?.parameterId) {
        r.assignedParameterId = r.suggestion.parameterId;
        r.source = r.suggestion.source;
        r.confidence = r.suggestion.confidence;
        acceptedCount += 1;
      }
    });
    refreshTableView();
    showBannerMessage(`Accepted ${acceptedCount} high-confidence suggestion(s).`, 'success');
  });

  document.getElementById('btn-clear-all')?.addEventListener('click', () => {
    state.rows.forEach(r => {
      r.assignedParameterId = null;
      r.source = 'none';
      r.confidence = null;
    });
    refreshTableView();
    showBannerMessage('Cleared all row mappings.', 'info');
  });
}

/**
 * Attaches event listeners for CSV exports and dismissals.
 */
function wireExportListeners() {
  document.getElementById('btn-export-mapping')?.addEventListener('click', () => {
    const allRows = getAllMappedRows();
    const mappingCsv = buildMappingCsv(
      allRows.map(r => ({
        sheet: r.sheet,
        rowIndex: r.rowIndex,
        rawLabel: r.rawLabel,
        normLabel: r.normLabel,
        parameterId: r.assignedParameterId,
        source: r.assignedParameterId ? r.source : 'none',
        confidence: r.assignedParameterId ? r.confidence : '',
      })),
      state.modelFileName
    );
    const sheetPart = state.sheetRowsMap.size > 1 ? 'all_sheets' : (state.currentSheet || 'sheet');
    const exportName = `${state.modelFileName || 'model'}_${sheetPart}_mapping.csv`;
    triggerCsvDownload(exportName, mappingCsv);
    showBannerMessage(`Exported mapping CSV: ${exportName}`, 'success');
  });

  document.getElementById('btn-export-history')?.addEventListener('click', () => {
    const tplInput = /** @type {HTMLInputElement} */ (document.getElementById('export-template-id'));
    const mappedByInput = /** @type {HTMLInputElement} */ (document.getElementById('export-mapped-by'));
    const templateId = tplInput?.value.trim() || 'user_model';
    const mappedBy = mappedByInput?.value.trim() || 'analyst';

    const allRows = getAllMappedRows();
    const updatedHistoryCsv = buildUpdatedHistoryCsv(
      state.activeHistory,
      allRows.map(r => ({
        sheet: r.sheet,
        rawLabel: r.rawLabel,
        normLabel: r.normLabel,
        parameterId: r.assignedParameterId,
        source: r.source,
      })),
      { templateId, mappedBy }
    );
    triggerCsvDownload('updated_history.csv', updatedHistoryCsv);
    showBannerMessage('Exported updated history CSV with accepted mappings.', 'success');
  });

  document.getElementById('status-dismiss')?.addEventListener('click', hideBannerMessage);
}

/**
 * Sets up all DOM event listeners.
 */
function wireEventListeners() {
  wireUploadListeners();
  wireWorkspaceListeners();
  wireExportListeners();
}

// Initialise application on DOM load
wireEventListeners();
initializeDefaults();
