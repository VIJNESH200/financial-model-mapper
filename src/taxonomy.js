/**
 * @fileoverview Loads, validates, and indexes standardised financial parameter taxonomies.
 */

import { normaliseLabel } from './normalise.js';

/**
 * Validates a taxonomy data structure.
 * @param {unknown} data The object to validate.
/**
 * Validates an individual taxonomy parameter entry.
 * @param {unknown} param The parameter entry to validate.
 * @param {number} index Index in parameters array.
 * @param {Set<string>} seenIds Set of previously seen parameter IDs.
 * @param {string[]} errors Array to collect validation error messages.
 */
function validateParameter(param, index, seenIds, errors) {
  if (!param || typeof param !== 'object') {
    errors.push(`Parameter at index ${index} must be an object.`);
    return;
  }

  const item = /** @type {{id?: unknown, displayName?: unknown, category?: unknown, aliases?: unknown}} */ (param);
  if (!item.id || typeof item.id !== 'string') {
    errors.push(`Parameter at index ${index} must have a non-empty string "id".`);
  } else if (seenIds.has(item.id)) {
    errors.push(`Duplicate parameter id "${item.id}" detected at index ${index}.`);
  } else {
    seenIds.add(item.id);
  }

  const identifier = String(item.id || index);
  if (!item.displayName || typeof item.displayName !== 'string') {
    errors.push(`Parameter "${identifier}" must have a non-empty "displayName".`);
  }
  if (!item.category || typeof item.category !== 'string') {
    errors.push(`Parameter "${identifier}" must have a string "category".`);
  }
  if (!Array.isArray(item.aliases)) {
    errors.push(`Parameter "${identifier}" must have an "aliases" array.`);
  }
}

/**
 * Validates a taxonomy data structure.
 * @param {unknown} data The object to validate.
 * @return {{valid: boolean, errors: string[]}} Validation result with any descriptive errors.
 */
export function validateTaxonomy(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Taxonomy root must be an object.'] };
  }

  const { version, parameters } = /** @type {{version?: unknown, parameters?: unknown}} */ (data);

  if (typeof version !== 'number') {
    errors.push('Taxonomy must define a numeric "version".');
  }

  if (!Array.isArray(parameters)) {
    errors.push('Taxonomy must define a "parameters" array.');
    return { valid: false, errors };
  }

  const seenIds = new Set();
  parameters.forEach((param, index) => validateParameter(param, index, seenIds, errors));

  return { valid: errors.length === 0, errors };
}

/**
 * Parses a taxonomy JSON string and validates its structure.
 * @param {string} jsonString Raw JSON content.
 * @return {{taxonomy: Object|null, errors: string[]}} Parsed taxonomy or validation errors.
 */
export function parseTaxonomyJson(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    const validation = validateTaxonomy(parsed);
    if (!validation.valid) {
      return { taxonomy: null, errors: validation.errors };
    }
    return { taxonomy: parsed, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { taxonomy: null, errors: [`JSON parse error: ${message}`] };
  }
}

/**
 * Fetches and validates a taxonomy JSON file from a URL.
 * @param {string} url Resource URL to fetch.
 * @return {Promise<Object>} Resolves to the parsed taxonomy.
 */
export async function loadTaxonomyFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load taxonomy from ${url}: HTTP ${response.status}`);
  }
  const text = await response.text();
  const { taxonomy, errors } = parseTaxonomyJson(text);
  if (!taxonomy) {
    throw new Error(`Invalid taxonomy at ${url}:\n${errors.join('\n')}`);
  }
  return taxonomy;
}

/**
 * Builds a lookup map from normalised aliases to matching taxonomy parameters.
 * @param {Object} taxonomy Validated taxonomy object.
 * @param {Object} [normalisationOptions] Options passed to normaliseLabel.
 * @return {Map<string, Object[]>} Map where keys are normalised aliases and values are parameter objects.
 */
export function buildAliasLookup(taxonomy, normalisationOptions) {
  const lookup = new Map();
  if (!taxonomy || !Array.isArray(taxonomy.parameters)) {
    return lookup;
  }

  for (const param of taxonomy.parameters) {
    // Both displayName and explicit aliases serve as matchable names.
    const allNames = [param.displayName, ...(param.aliases || [])];
    for (const name of allNames) {
      const norm = normaliseLabel(name, normalisationOptions);
      if (!norm) {
        continue;
      }
      const existing = lookup.get(norm) || [];
      if (!existing.some(item => item.id === param.id)) {
        existing.push(param);
      }
      lookup.set(norm, existing);
    }
  }

  return lookup;
}
