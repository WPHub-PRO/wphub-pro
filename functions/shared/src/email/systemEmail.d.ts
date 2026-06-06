import { DEFAULT_EMAIL_TEMPLATES_BY_EVENT } from './platformEmailTemplateDefaults.ts';
/** @typedef {Record<string, string>} ShortcodeContext */
declare const SHORTCODE_RE: RegExp;
declare function escapeHtml(s: any): string;
/**
 * @param {string} input
 * @param {ShortcodeContext} rawContext
 */
declare function replaceShortcodes(input: any, rawContext: any): string;
/**
 * Built-in fallbacks when DB template missing or disabled.
 * Uses {{shortcodes}} only — URLs must be passed in context.
 */
declare function defaultTemplateForEvent(eventKey: any): {
    title: any;
    subject: any;
    body_html: any;
};
/**
 * @param {import('node-appwrite').Databases} databases
 * @returns {Promise<{ header_html: string; footer_html: string }>}
 */
declare function getEmailShell(databases: any): Promise<{
    header_html: string;
    footer_html: string;
}>;
/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} eventKey
 */
declare function getTemplateRow(databases: any, eventKey: any): Promise<any>;
/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} eventKey
 * @param {ShortcodeContext} context
 * @returns {Promise<{ subject: string; html: string; text: string; usedDbTemplate: boolean }>}
 */
declare function renderSystemEmail(databases: any, eventKey: any, context: any): Promise<{
    subject: string;
    html: string;
    text: string;
    usedDbTemplate: boolean;
}>;
declare const shellDocumentId = "default";
export { SHORTCODE_RE, escapeHtml, replaceShortcodes, defaultTemplateForEvent, DEFAULT_EMAIL_TEMPLATES_BY_EVENT, renderSystemEmail, getEmailShell, getTemplateRow, shellDocumentId, };
