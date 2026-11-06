/**
 * @fileoverview Normalises financial model row labels according to configuration rules.
 */

const DEFAULT_OPTIONS = {
  lowercase: true,
  trimWhitespace: true,
  collapseSpaces: true,
  stripPunctuation: true,
};

/**
 * Normalises a label string based on configurable normalisation options.
 * @param {string} rawLabel The input text to normalise.
 * @param {Object} [options] Normalisation configuration flags.
 * @return {string} The normalised label.
 */
export function normaliseLabel(rawLabel, options = DEFAULT_OPTIONS) {
  if (rawLabel === null || rawLabel === undefined) {
    return '';
  }

  let text = String(rawLabel);
  const activeOptions = { ...DEFAULT_OPTIONS, ...options };

  if (activeOptions.trimWhitespace) {
    text = text.trim();
  }

  if (activeOptions.lowercase) {
    text = text.toLowerCase();
  }

  if (activeOptions.stripPunctuation) {
    // Replace non-alphanumeric, non-whitespace characters with spaces
    // so hyphens or slashes separate tokens instead of fusing them together.
    text = text.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  }

  if (activeOptions.collapseSpaces) {
    text = text.replace(/\s+/g, ' ');
  }

  if (activeOptions.trimWhitespace) {
    text = text.trim();
  }

  return text;
}
