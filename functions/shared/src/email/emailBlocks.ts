/**
 * Email template body stored as JSON (`wphubEmailBlocks`) or legacy HTML string.
 * Normalizes to HTML before shortcode replacement in `systemEmail.js`.
 */

/**
 * @param {string} raw
 * @returns {object | null}
 */
function tryParseBlocksDoc(raw) {
  const s = String(raw || '').trim();
  if (!s.startsWith('{')) return null;
  try {
    const j = JSON.parse(s);
    if (j && j.wphubEmailBlocks === true && Number(j.version) === 1 && Array.isArray(j.blocks)) {
      return j;
    }
  } catch (_) {
    /* legacy HTML starting with { is extremely rare */
  }
  return null;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attrEscape(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/**
 * @param {object} doc
 * @returns {string}
 */
function blocksDocToHtml(doc) {
  if (!doc || !Array.isArray(doc.blocks)) return '';
  const out = [];
  for (const b of doc.blocks) {
    if (!b || typeof b !== 'object' || !b.type) continue;
    switch (b.type) {
      case 'heading': {
        const lvl = Number(b.level) === 3 ? 3 : 2;
        const tag = lvl === 3 ? 'h3' : 'h2';
        const fs = lvl === 2 ? '20px' : '17px';
        out.push(
          `<${tag} style="margin:0 0 12px;font-size:${fs};font-weight:600;line-height:1.3">${escapeHtml(String(b.text || ''))}</${tag}>`,
        );
        break;
      }
      case 'paragraph': {
        const inner = escapeHtml(String(b.text || '')).replace(/\n/g, '<br/>');
        out.push(`<p style="margin:0 0 12px;line-height:1.5">${inner}</p>`);
        break;
      }
      case 'button_row': {
        const pl = escapeHtml(String(b.primaryLabel || 'Accept'));
        const ph = String(b.primaryHref || '').trim();
        const sl = escapeHtml(String(b.secondaryLabel || 'Decline'));
        const sh = String(b.secondaryHref || '').trim();
        const hasSecondary = Boolean(String(b.secondaryLabel || '').trim());
        let inner = `<a href="${attrEscape(ph)}" style="display:inline-block;padding:12px 20px;background:#0d6efd;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">${pl}</a>`;
        if (hasSecondary) {
          inner += ` &nbsp; <a href="${attrEscape(sh)}" style="display:inline-block;padding:12px 20px;background:#6c757d;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">${sl}</a>`;
        }
        out.push(`<p style="margin:24px 0">${inner}</p>`);
        break;
      }
      case 'hint': {
        const inner = escapeHtml(String(b.text || '')).replace(/\n/g, '<br/>');
        out.push(`<p style="font-size:13px;color:#666;margin:0 0 12px;line-height:1.45">${inner}</p>`);
        break;
      }
      case 'spacer': {
        const px = Math.min(64, Math.max(4, Number(b.px) || 16));
        out.push(`<div style="height:${px}px;line-height:0">&nbsp;</div>`);
        break;
      }
      case 'html':
        out.push(String(b.content || ''));
        break;
      default:
        break;
    }
  }
  return out.join('\n');
}

/**
 * @param {string} bodyTpl
 * @returns {string} HTML fragment for shortcode pass
 */
function normalizeBodyTemplate(bodyTpl) {
  const doc = tryParseBlocksDoc(bodyTpl);
  if (doc) return blocksDocToHtml(doc);
  return String(bodyTpl || '');
}

export { tryParseBlocksDoc, blocksDocToHtml, normalizeBodyTemplate };
