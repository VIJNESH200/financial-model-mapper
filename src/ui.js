/**
 * @fileoverview DOM rendering and user interface manipulation functions.
 */

/**
 * Displays a visible banner notification to the user.
 * @param {string} message Text message to display.
 * @param {'info'|'success'|'error'} [type] Banner visual level.
 */
export function showBannerMessage(message, type = 'info') {
  const banner = document.getElementById('status-banner');
  const msgEl = document.getElementById('status-message');
  if (!banner || !msgEl) {
    return;
  }

  banner.className = `status-banner ${type}`;
  msgEl.textContent = message;
}

/**
 * Hides the banner notification.
 */
export function hideBannerMessage() {
  const banner = document.getElementById('status-banner');
  if (banner) {
    banner.className = 'status-banner hidden';
  }
}

/**
 * Updates progress indicator visibility and percent completion.
 * @param {number} percent Completion percentage (0 to 100).
 * @param {string} [label] Descriptive text under the progress bar.
 * @param {boolean} [isVisible] Whether the progress container is visible.
 */
export function updateFileProgress(percent, label = '', isVisible = true) {
  const container = document.getElementById('excel-progress');
  const fill = document.getElementById('excel-progress-fill');
  const labelEl = document.getElementById('excel-progress-label');

  if (!container || !fill || !labelEl) {
    return;
  }

  container.className = isVisible ? 'progress-container' : 'progress-container hidden';
  fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  if (label) {
    labelEl.textContent = label;
  }
}

/**
 * Populates the sheet selector dropdown with sheet names.
 * @param {string[]} sheetNames Available sheet names.
 * @param {string} [selectedSheet] Currently selected sheet name.
 */
export function populateSheetOptions(sheetNames, selectedSheet = '') {
  const select = /** @type {HTMLSelectElement} */ (document.getElementById('sheet-select'));
  if (!select) {
    return;
  }

  select.innerHTML = '';
  if (sheetNames.length === 0) {
    select.disabled = true;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '-- No sheets found --';
    select.appendChild(placeholder);
    return;
  }

  sheetNames.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    if (name === selectedSheet) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  select.disabled = false;
}

/**
 * Groups taxonomy parameters by their category.
 * @param {Object} taxonomy Validated taxonomy object.
 * @return {Map<string, Array<Object>>} Grouped parameters.
 */
function groupTaxonomyByCategory(taxonomy) {
  const groups = new Map();
  if (!taxonomy || !Array.isArray(taxonomy.parameters)) {
    return groups;
  }

  taxonomy.parameters.forEach(param => {
    const cat = param.category || 'other';
    const list = groups.get(cat) || [];
    list.push(param);
    groups.set(cat, list);
  });

  return groups;
}

/**
 * Formats a category slug into a readable label.
 * @param {string} slug Category slug (e.g. income_statement).
 * @return {string} Human-readable label.
 */
function formatCategoryLabel(slug) {
  return slug
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Escapes special HTML characters in a string to prevent markup injection.
 * Converts &, <, >, ", and ' to their respective HTML entities.
 * @param {unknown} value Value to escape.
 * @return {string} Escaped HTML entity string.
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates options HTML for the parameter assignment dropdown.
 * @param {Object} taxonomy Validated taxonomy object.
 * @param {string|null} selectedId Currently assigned parameter id.
 * @return {string} HTML string containing optgroups and options.
 */
export function buildParameterOptionsHtml(taxonomy, selectedId) {
  let html = '<option value="">-- Unmapped --</option>';
  const groups = groupTaxonomyByCategory(taxonomy);

  for (const [category, params] of groups.entries()) {
    const escapedCategory = escapeHtml(formatCategoryLabel(category));
    html += `<optgroup label="${escapedCategory}">`;
    for (const param of params) {
      const isSelected = param.id === selectedId ? ' selected' : '';
      const escapedId = escapeHtml(param.id);
      const escapedDisplayName = escapeHtml(param.displayName);
      html += `<option value="${escapedId}"${isSelected}>${escapedDisplayName}</option>`;
    }
    html += '</optgroup>';
  }

  return html;
}

/**
 * Renders the suggestion cell content.
 * @param {Object} suggestion The row suggestion object.
 * @param {Object} taxonomy The parameter taxonomy.
 * @return {string} HTML for the suggestion cell.
 */
function renderSuggestionCell(suggestion, taxonomy) {
  if (!suggestion || suggestion.source === 'none' || !suggestion.parameterId) {
    return '<span class="badge badge-none">None</span>';
  }

  const escapedConfidence = escapeHtml(suggestion.confidence);
  const escapedSource = escapeHtml(suggestion.source);
  const escapedParameterId = escapeHtml(suggestion.parameterId);
  const badgeClass = `badge badge-${escapedConfidence}`;

  let conflictBadge = '';
  if (suggestion.hasConflict) {
    conflictBadge = '<span class="badge badge-conflict" title="Multiple historical mappings exist">Conflict</span>';
  }

  const param = taxonomy?.parameters?.find(p => p.id === suggestion.parameterId);
  const displayName = param ? param.displayName : suggestion.parameterId;
  const escapedDisplayName = escapeHtml(displayName);
  const desc = `Source: ${escapedSource}`;

  return `
    <div>
      <span class="${badgeClass}">${escapedConfidence}</span>
      ${conflictBadge}
      <span style="font-weight: 500; margin-left: 6px;" data-param-id="${escapedParameterId}">${escapedDisplayName}</span>
      <div class="suggestion-desc">${desc}</div>
    </div>
  `;
}

/**
 * Determines whether a row matches the currently active filter criteria.
 * @param {Object} item Row state object.
 * @param {string} filter Active filter mode.
 * @return {boolean} True if the row should be visible.
 */
function matchesFilter(item, filter) {
  if (filter === 'unmapped') {
    return !item.assignedParameterId;
  }
  if (filter === 'low-confidence') {
    return item.suggestion?.confidence === 'low';
  }
  if (filter === 'conflicts') {
    return Boolean(item.suggestion?.hasConflict);
  }
  return true;
}

/**
 * Creates the action cell with Accept or Clear buttons.
 * @param {Object} item Row state object.
 * @param {Object} callbacks User action callbacks.
 * @return {HTMLTableCellElement} Created table cell.
 */
function createActionCell(item, callbacks) {
  const tdAction = document.createElement('td');
  tdAction.className = 'col-action';

  if (!item.assignedParameterId && item.suggestion?.parameterId) {
    const btnAccept = document.createElement('button');
    btnAccept.type = 'button';
    btnAccept.className = 'btn-sm btn-primary';
    btnAccept.textContent = 'Accept';
    btnAccept.setAttribute('aria-label', `Accept suggested parameter for ${item.rawLabel}`);
    btnAccept.addEventListener('click', () => callbacks.onAccept(item.rowIndex));
    tdAction.appendChild(btnAccept);
  } else if (item.assignedParameterId) {
    const btnClear = document.createElement('button');
    btnClear.type = 'button';
    btnClear.className = 'btn-sm';
    btnClear.textContent = 'Clear';
    btnClear.setAttribute('aria-label', `Clear mapping for ${item.rawLabel}`);
    btnClear.addEventListener('click', () => callbacks.onClear(item.rowIndex));
    tdAction.appendChild(btnClear);
  }

  return tdAction;
}

/**
 * Creates a single table row element for a financial model line item.
 * @param {Object} item Row state object.
 * @param {Object} taxonomy Standardised parameter taxonomy.
 * @param {Object} callbacks User action callbacks.
 * @return {HTMLTableRowElement} Created table row.
 */
function createTableRow(item, taxonomy, callbacks) {
  const tr = document.createElement('tr');
  tr.dataset.rowIndex = String(item.rowIndex);

  const tdIndex = document.createElement('td');
  tdIndex.className = 'col-index';
  tdIndex.textContent = String(item.rowIndex);
  tr.appendChild(tdIndex);

  const tdLabel = document.createElement('td');
  tdLabel.className = 'col-label';
  tdLabel.textContent = item.rawLabel;
  tr.appendChild(tdLabel);

  const tdSuggestion = document.createElement('td');
  tdSuggestion.className = 'col-suggestion';
  tdSuggestion.innerHTML = renderSuggestionCell(item.suggestion, taxonomy);
  tr.appendChild(tdSuggestion);

  const tdAssignment = document.createElement('td');
  tdAssignment.className = 'col-assignment';
  const select = document.createElement('select');
  select.setAttribute('aria-label', `Assign parameter for ${item.rawLabel}`);
  select.innerHTML = buildParameterOptionsHtml(taxonomy, item.assignedParameterId);
  select.addEventListener('change', event => {
    const target = /** @type {HTMLSelectElement} */ (event.target);
    callbacks.onAssign(item.rowIndex, target.value);
  });
  tdAssignment.appendChild(select);
  tr.appendChild(tdAssignment);

  tr.appendChild(createActionCell(item, callbacks));
  return tr;
}

/**
 * Renders table body rows based on current state and active filter.
 * Attaches event listeners for accepting suggestions and changing assignments.
 * @param {Array<Object>} rows Array of row states.
 * @param {Object} taxonomy Active taxonomy.
 * @param {string} activeFilter Filter value ('all', 'unmapped', etc.).
 * @param {Object} callbacks Event callbacks for user actions.
 * @param {function(number): void} callbacks.onAccept Callback when suggestion is accepted.
 * @param {function(number, string): void} callbacks.onAssign Callback when dropdown changes.
 * @param {function(number): void} callbacks.onClear Callback when mapping is cleared.
 */
export function renderMappingTable(rows, taxonomy, activeFilter, callbacks) {
  const tbody = document.getElementById('mapping-table-body');
  if (!tbody) {
    return;
  }

  tbody.innerHTML = '';
  const filteredRows = rows.filter(r => matchesFilter(r, activeFilter));

  if (filteredRows.length === 0) {
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = '<td colspan="5" style="text-align: center; color: #64748b; padding: 24px;">No rows match the selected filter.</td>';
    tbody.appendChild(emptyRow);
    return;
  }

  filteredRows.forEach(item => {
    tbody.appendChild(createTableRow(item, taxonomy, callbacks));
  });
}

/**
 * Updates metrics summary indicators in the workspace header.
 * @param {Array<Object>} rows Array of all rows for the active sheet.
 */
export function updateSummaryMetrics(rows) {
  const totalEl = document.getElementById('metric-total');
  const mappedEl = document.getElementById('metric-mapped');
  const unmappedEl = document.getElementById('metric-unmapped');
  const conflictsEl = document.getElementById('metric-conflicts');

  const total = rows.length;
  const mapped = rows.filter(r => Boolean(r.assignedParameterId)).length;
  const unmapped = total - mapped;
  const conflicts = rows.filter(r => Boolean(r.suggestion?.hasConflict)).length;

  if (totalEl) totalEl.textContent = `Total Rows: ${total}`;
  if (mappedEl) mappedEl.textContent = `Mapped: ${mapped}`;
  if (unmappedEl) unmappedEl.textContent = `Unmapped: ${unmapped}`;
  if (conflictsEl) conflictsEl.textContent = `Conflicts: ${conflicts}`;
}

/**
 * Toggles visibility of the mapping workspace and export sections.
 * @param {boolean} isVisible Whether workspace should be shown.
 */
export function toggleWorkspaceVisibility(isVisible) {
  const workspace = document.getElementById('workspace-panel');
  const exportPanel = document.getElementById('export-panel');
  if (workspace) {
    workspace.className = isVisible ? 'workspace-panel' : 'workspace-panel hidden';
  }
  if (exportPanel) {
    exportPanel.className = isVisible ? 'export-panel' : 'export-panel hidden';
  }
}
