/**
 * Coerce to string and trim whitespace; `null` / `undefined` → `''`.
 * Shared across Appwrite functions — keep behavior identical everywhere.
 *
 * @param {unknown} s
 * @returns {string}
 */
declare function trimStr(s: any): string;
/**
 * Strip HTML tags to plain text for ticket-style bodies (Node-safe; no DOM).
 * Collapses whitespace; does not decode entities (same class of limitation as a simple browser fallback).
 *
 * @param {unknown} html
 * @returns {string}
 */
declare function stripHtmlToPlainText(html: any): string;
export { trimStr, stripHtmlToPlainText };
