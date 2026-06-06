/** Pull first email from a From header like `Name <a@b.com>`. */
export function extractEmailFromFromHeader(from: string): string {
  const t = String(from || '').trim();
  const m = t.match(/<([^>]+)>/);
  if (m) return m[1].trim();
  if (/^[^\s@]+@[^\s@]+$/.test(t)) return t;
  return '';
}

export function stripHtmlToText(html: string): string {
  const trimmed = String(html || '').trim();
  if (!trimmed) return '';
  try {
    const doc = new DOMParser().parseFromString(trimmed, 'text/html');
    return doc.body?.textContent?.trim() || '';
  } catch {
    return trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

/** Escape plain text and turn paragraphs / newlines into simple HTML for multipart/alternative. */
export function plainTextToSimpleHtml(plain: string): string {
  const t = String(plain || '').trim();
  if (!t) return '';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc(t)
    .split(/\n\n+/)
    .map((block) => `<p>${block.replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

const QUOTE_STRIP_SELECTOR = 'script, style, iframe, object, embed, link, meta, base';

/** Sanitize original HTML for inclusion as a quoted block in reply/forward (browser-only). */
export function sanitizeEmailQuoteHtml(html: string): string | null {
  const trimmed = String(html || '').trim();
  if (!trimmed) return null;
  try {
    const doc = new DOMParser().parseFromString(trimmed, 'text/html');
    doc.querySelectorAll(QUOTE_STRIP_SELECTOR).forEach((el) => el.remove());
    doc.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((attr) => {
        const n = attr.name.toLowerCase();
        if (n.startsWith('on')) el.removeAttribute(attr.name);
        if ((n === 'href' || n === 'src') && /^\s*javascript:/i.test(attr.value)) {
          el.removeAttribute(attr.name);
        }
      });
    });
    const inner = doc.body?.innerHTML?.trim() || '';
    if (!inner) return null;
    return `<blockquote type="cite" style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex">${inner}</blockquote>`;
  } catch {
    return null;
  }
}

export const MAIL_COMPOSE_REPLY_SEP = '\n\n---\n';
export const MAIL_COMPOSE_FORWARD_SEP = '\n\n--- Forwarded message ---\n';

/** Quill / empty rich-text noise — treat as no user content for validation and SMTP merge. */
export function isEffectivelyEmptyHtml(html: string): boolean {
  const t = String(html || '')
    .replace(/\s|&nbsp;/g, '')
    .toLowerCase();
  return (
    t === '' ||
    t === '<p></p>' ||
    t === '<p><br></p>' ||
    t === '<p><br/></p>' ||
    t === '<br>' ||
    t === '<br/>'
  );
}

/**
 * Best-effort match to user-mailbox `send_message` (script tags only server-side).
 * Full MIME safety still depends on the server; users can paste hostile HTML — see send pipeline.
 */
export function stripInlineScriptsFromHtml(html: string): string {
  return String(html || '').replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
}

/**
 * Build multipart/html body: rich user HTML plus optional quoted tail (blockquote or escaped plain).
 * When {@link quotedAppendHtml} is null, returns user HTML only (new message).
 */
export function buildOutgoingHtmlFromParts(userHtml: string, quotedAppendHtml: string | null): string {
  const u = stripInlineScriptsFromHtml(String(userHtml || '')).trim();
  const q = quotedAppendHtml?.trim();
  const uEmpty = isEffectivelyEmptyHtml(u);
  if (!q) return uEmpty ? '' : u;
  if (uEmpty) return q;
  return `${u}<br/><br/>${q}`;
}

/** Build HTML body for SMTP: user part from plain + optional pre-sanitized quoted HTML for reply/forward. */
export function buildOutgoingMailHtml(
  fullPlain: string,
  kind: 'reply' | 'forward' | null,
  quotedHtml: string | null,
): string {
  const trimmed = String(fullPlain || '').trim();
  if (!trimmed) return '';
  if (!quotedHtml || !kind) {
    return plainTextToSimpleHtml(trimmed);
  }
  const sep = kind === 'forward' ? MAIL_COMPOSE_FORWARD_SEP : MAIL_COMPOSE_REPLY_SEP;
  const i = trimmed.indexOf(sep);
  if (i === -1) {
    return plainTextToSimpleHtml(trimmed);
  }
  const user = trimmed.slice(0, i).trimEnd();
  const userHtml = user ? plainTextToSimpleHtml(user) : '';
  return userHtml ? `${userHtml}<br/><br/>${quotedHtml}` : quotedHtml;
}

export type MailComposeLocationState = {
  mailCompose?: {
    mode: 'reply' | 'forward';
    /** Disambiguates presets when subject/message-id repeat. */
    messageKey?: string;
    to?: string;
    subject: string;
    body: string;
    /** Sanitized original HTML for quoted section when the source message had HTML. */
    bodyHtml?: string;
    messageId?: string;
    references?: string;
  };
};
