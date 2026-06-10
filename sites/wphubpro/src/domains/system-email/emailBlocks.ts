import type { SystemEmailEventKey } from './events';

export const EMAIL_BLOCKS_VERSION = 1 as const;

export type EmailBlocksDoc = {
  wphubEmailBlocks: true;
  version: typeof EMAIL_BLOCKS_VERSION;
  blocks: EmailBlock[];
};

export type EmailBlock =
  | { id: string; type: 'heading'; level: 2 | 3; text: string }
  | { id: string; type: 'paragraph'; text: string }
  | {
      id: string;
      type: 'button_row';
      primaryLabel: string;
      primaryHref: string;
      secondaryLabel: string;
      secondaryHref: string;
    }
  | { id: string; type: 'hint'; text: string }
  | { id: string; type: 'spacer'; px: number }
  | { id: string; type: 'html'; content: string };

export function newBlockId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `b_${crypto.randomUUID()}`;
  }
  return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function isBlocksDoc(v: unknown): v is EmailBlocksDoc {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    o.wphubEmailBlocks === true &&
    Number(o.version) === EMAIL_BLOCKS_VERSION &&
    Array.isArray(o.blocks)
  );
}

export function serializeBlocksDoc(doc: EmailBlocksDoc): string {
  return JSON.stringify(doc);
}

/** Default blocks for `team_invite` (matches prior built-in HTML). */
export function defaultBlocksTeamInvite(): EmailBlocksDoc {
  return {
    wphubEmailBlocks: true,
    version: EMAIL_BLOCKS_VERSION,
    blocks: [
      {
        id: newBlockId(),
        type: 'paragraph',
        text: 'You have been invited to join {{team_name}} on {{platform_title}}.',
      },
      {
        id: newBlockId(),
        type: 'button_row',
        primaryLabel: 'Accept',
        primaryHref: '{{invite_accept_url}}',
        secondaryLabel: 'Decline',
        secondaryHref: '{{invite_decline_url}}',
      },
      {
        id: newBlockId(),
        type: 'hint',
        text: 'If the buttons do not work, copy this link into your browser:\n{{invite_review_url}}',
      },
    ],
  };
}

const DEFAULT_PARAGRAPH_BY_EVENT: Partial<Record<SystemEmailEventKey, string>> = {
  team_invite_existing_user:
    '{{invited_by_name}} invited you to join {{team_name}} on {{platform_title}}. {{summary_line}}',
  team_invite_user: 'Team invite for {{team_name}}: {{outcome}}. {{summary_line}}',
  plugin_update_available: 'Plugin updates are available on {{site_name}}. {{detail}}',
  theme_update_available: 'Theme updates are available on {{site_name}}. {{detail}}',
  bridge_plugin_update_available:
    'Update the bridge on {{site_name}} ({{installed_version}} → {{latest_version}}). {{detail}}',
  site_health_issue: 'Health issue on {{site_name}}: {{detail}}',
  site_uptime_down: '{{site_name}} appears down ({{status_label}}). {{detail}}',
  site_uptime_up: '{{site_name}} is back up. {{detail}}',
  site_connection_issue: 'Connection issue on {{site_name}}: {{detail}}',
  subscription_renewal_upcoming: 'Your subscription renews soon. {{detail}}',
  subscription_change: '{{title}} — {{body}}',
  limit_reached: 'Seat limit reached (max {{max_seats}}). {{detail}}',
  ticket_reply: '{{title}}\n{{body}}',
  ticket_status: '{{title}}\n{{body}}',
  ticket_priority: '{{title}}\n{{body}}',
};

export function defaultBlocksForEvent(eventKey: SystemEmailEventKey): EmailBlocksDoc {
  if (eventKey === 'team_invite') return defaultBlocksTeamInvite();
  const text =
    DEFAULT_PARAGRAPH_BY_EVENT[eventKey] ||
    'Notification from {{platform_title}}. Open {{app_url}} for details.';
  return {
    wphubEmailBlocks: true,
    version: EMAIL_BLOCKS_VERSION,
    blocks: [{ id: newBlockId(), type: 'paragraph', text }],
  };
}

/**
 * Load stored `body_html`: JSON blocks document, or legacy HTML wrapped in a raw HTML block.
 */
export function hydrateBlocksFromBodyHtml(bodyHtml: string, eventKey: SystemEmailEventKey): EmailBlocksDoc {
  const t = bodyHtml.trim();
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as unknown;
      if (isBlocksDoc(j)) return j;
    } catch {
      /* fall through */
    }
  }
  if (t.length > 0) {
    return {
      wphubEmailBlocks: true,
      version: EMAIL_BLOCKS_VERSION,
      blocks: [{ id: newBlockId(), type: 'html', content: bodyHtml }],
    };
  }
  return defaultBlocksForEvent(eventKey);
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attrEscape(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

/**
 * HTML fragment sent to `normalizeBodyTemplate` / shortcode replacement.
 * Mirrors `functions-lib/emailBlocks.js` `blocksDocToHtml`.
 */
export function blocksDocToHtml(doc: EmailBlocksDoc): string {
  const out: string[] = [];
  for (const b of doc.blocks) {
    switch (b.type) {
      case 'heading': {
        const lvl = b.level === 3 ? 3 : 2;
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
      default: {
        const _never: never = b;
        void _never;
        break;
      }
    }
  }
  return out.join('\n');
}

/** Persist GrapesJS / source HTML as a single raw-HTML block (matches DB + server pipeline). */
export function emailBodyDocFromHtmlFragment(html: string, previous: EmailBlocksDoc): EmailBlocksDoc {
  const prevSingle = previous.blocks.length === 1 && previous.blocks[0]?.type === 'html' ? previous.blocks[0] : null;
  const id = prevSingle?.id ?? newBlockId();
  return {
    wphubEmailBlocks: true,
    version: EMAIL_BLOCKS_VERSION,
    blocks: [{ id, type: 'html', content: html }],
  };
}
