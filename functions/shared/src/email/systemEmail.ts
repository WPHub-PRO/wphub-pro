import * as sdk from 'node-appwrite';
import { WPHUB_APPWRITE_IDS } from '../appwrite/ids.ts';
import { normalizeBodyTemplate } from './emailBlocks.ts';
import { DEFAULT_EMAIL_TEMPLATES_BY_EVENT } from './platformEmailTemplateDefaults.ts';
import { appwriteDatabaseId } from '../core/env.ts';

const SHELL_DOC_ID = 'default';

/** @typedef {Record<string, string>} ShortcodeContext */

const SHORTCODE_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escape values used inside HTML templates unless key ends with _html (trusted HTML fragment).
 * @param {ShortcodeContext} ctx
 * @returns {ShortcodeContext}
 */
function escapeContextForHtml(ctx) {
  /** @type {ShortcodeContext} */
  const out = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (k.endsWith('_html')) out[k] = v == null ? '' : String(v);
    else out[k] = v == null ? '' : escapeHtml(String(v));
  }
  return out;
}

/**
 * @param {string} input
 * @param {ShortcodeContext} rawContext
 */
function replaceShortcodes(input, rawContext) {
  const ctx = escapeContextForHtml(rawContext);
  return String(input || '').replace(SHORTCODE_RE, (_, name) => {
    const key = String(name || '').trim();
    if (!key) return '';
    const v = ctx[key];
    return v != null ? String(v) : '';
  });
}

function dbId() {
  return String(appwriteDatabaseId() || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

function shellColl() {
  return WPHUB_APPWRITE_IDS.platformTables.systemEmailShell;
}

function templatesColl() {
  return WPHUB_APPWRITE_IDS.platformTables.systemEmailTemplates;
}

/**
 * Built-in fallbacks when DB template missing or disabled.
 * Uses {{shortcodes}} only — URLs must be passed in context.
 */
function defaultTemplateForEvent(eventKey) {
  const k = String(eventKey || '').trim();
  const def = DEFAULT_EMAIL_TEMPLATES_BY_EVENT[k];
  if (!def) return null;
  return { title: def.title, subject: def.subject, body_html: def.body_html };
}

function defaultTextFallbackForEvent(eventKey, context) {
  const k = String(eventKey || '').trim();
  const def = DEFAULT_EMAIL_TEMPLATES_BY_EVENT[k];
  if (def?.body_plain) {
    return replaceShortcodes(def.body_plain, context);
  }
  const title = context.title || context.notification_title || '';
  const body = context.body || context.notification_body || context.detail || '';
  const lines = [];
  if (title) lines.push(String(title));
  if (body) lines.push('', String(body));
  const appUrl = context.app_url ? String(context.app_url) : '';
  if (appUrl) lines.push('', `Open: ${appUrl}`);
  return lines.length ? lines.join('\n') : 'Notification from WP Hub Pro';
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @returns {Promise<{ header_html: string; footer_html: string }>}
 */
async function getEmailShell(databases) {
  try {
    const doc = await databases.getDocument(dbId(), shellColl(), SHELL_DOC_ID);
    return {
      header_html: doc.header_html != null ? String(doc.header_html) : '',
      footer_html: doc.footer_html != null ? String(doc.footer_html) : '',
    };
  } catch {
    return { header_html: '', footer_html: '' };
  }
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} eventKey
 */
async function getTemplateRow(databases, eventKey) {
  const ek = String(eventKey || '').trim();
  if (!ek) return null;
  const list = await databases.listDocuments(dbId(), templatesColl(), [
    sdk.Query.equal('event_key', ek),
    sdk.Query.limit(1),
  ]);
  if (!list.total || !list.documents[0]) return null;
  return list.documents[0];
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} eventKey
 * @param {ShortcodeContext} context
 * @returns {Promise<{ subject: string; html: string; text: string; usedDbTemplate: boolean }>}
 */
async function renderSystemEmail(databases, eventKey, context) {
  const ek = String(eventKey || '').trim();
  const shell = await getEmailShell(databases);
  const row = await getTemplateRow(databases, ek);

  let subjectTpl;
  let bodyTpl;
  let usedDbTemplate = false;

  if (row && row.enabled !== false) {
    subjectTpl = String(row.subject || '');
    bodyTpl = String(row.body_html || '');
    usedDbTemplate = true;
  } else {
    const def = defaultTemplateForEvent(ek);
    if (!def) {
      throw new Error(`No default system email template for event_key=${ek}`);
    }
    subjectTpl = def.subject;
    bodyTpl = def.body_html;
    usedDbTemplate = false;
  }

  const subject = replaceShortcodes(subjectTpl, context);
  const header = replaceShortcodes(shell.header_html || '', context);
  const bodyTplNormalized = normalizeBodyTemplate(bodyTpl);
  const body = replaceShortcodes(bodyTplNormalized, context);
  const footer = replaceShortcodes(shell.footer_html || '', context);
  const html = `${header}${body}${footer}`;
  const text =
    context.email_text_plain != null && String(context.email_text_plain).trim() !== ''
      ? replaceShortcodes(String(context.email_text_plain), context)
      : defaultTextFallbackForEvent(ek, context);

  return { subject, html, text, usedDbTemplate };
}

const shellDocumentId = SHELL_DOC_ID;

export {
  SHORTCODE_RE,
  escapeHtml,
  replaceShortcodes,
  defaultTemplateForEvent,
  DEFAULT_EMAIL_TEMPLATES_BY_EVENT,
  renderSystemEmail,
  getEmailShell,
  getTemplateRow,
  shellDocumentId,
};
