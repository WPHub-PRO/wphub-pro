/**
 * Coerce to string and trim whitespace; `null` / `undefined` → `''`.
 * Shared across Appwrite functions — keep behavior identical everywhere.
 *
 * @param {unknown} s
 * @returns {string}
 */
function trimStr(s) {
  return s == null ? '' : String(s).trim();
}

/**
 * Strip HTML tags to plain text for ticket-style bodies (Node-safe; no DOM).
 * Collapses whitespace; does not decode entities (same class of limitation as a simple browser fallback).
 *
 * @param {unknown} html
 * @returns {string}
 */
function stripHtmlToPlainText(html) {
  const t = trimStr(html);
  if (!t) return '';
  return t
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export { trimStr, stripHtmlToPlainText };
