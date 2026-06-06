/**
 * Email template body stored as JSON (`wphubEmailBlocks`) or legacy HTML string.
 * Normalizes to HTML before shortcode replacement in `systemEmail.js`.
 */
/**
 * @param {string} raw
 * @returns {object | null}
 */
declare function tryParseBlocksDoc(raw: any): any;
/**
 * @param {object} doc
 * @returns {string}
 */
declare function blocksDocToHtml(doc: any): string;
/**
 * @param {string} bodyTpl
 * @returns {string} HTML fragment for shortcode pass
 */
declare function normalizeBodyTemplate(bodyTpl: any): string;
export { tryParseBlocksDoc, blocksDocToHtml, normalizeBodyTemplate };
