import { getPlatformSettingJson } from '../platform/platformSettingsJson.ts';
import { readEnv } from '../core/readEnv.ts';

/**
 * @typedef {{ provider?: string; from_email?: string; from_name?: string; reply_to?: string; webhook_url?: string }} EmailDeliverySettings
 */

/**
 * @param {import('node-appwrite').Databases | null | undefined} databases
 * @returns {Promise<EmailDeliverySettings>}
 */
async function loadEmailDeliverySettings(databases) {
  if (!databases) return {};
  try {
    const raw = await getPlatformSettingJson(databases, 'email_delivery');
    if (!raw || typeof raw !== 'object') return {};
    return /** @type {EmailDeliverySettings} */ (raw);
  } catch {
    return {};
  }
}

function formatFrom(delivery) {
  const email = String(delivery.from_email || '').trim();
  const name = String(delivery.from_name || '').trim();
  if (!email) return '';
  if (name) return `${name} <${email}>`;
  return email;
}

/**
 * @param {{
 *   databases?: import('node-appwrite').Databases | null;
 *   log?: (s: string) => void;
 *   to: string;
 *   subject: string;
 *   html: string;
 *   text?: string;
 *   deliveryOverride?: EmailDeliverySettings | null;
 * }} opts
 * @returns {Promise<{ ok: boolean; via: string }>}
 */
async function sendTransactionalEmail(opts) {
  const log = typeof opts.log === 'function' ? opts.log : () => {};
  const toEmail = String(opts.to || '')
    .trim()
    .toLowerCase();
  if (!toEmail) {
    log('transactionalEmail: missing to');
    return { ok: false, via: 'skipped' };
  }

  const delivery =
    opts.deliveryOverride && typeof opts.deliveryOverride === 'object'
      ? opts.deliveryOverride
      : await loadEmailDeliverySettings(opts.databases || null);

  const provider = String(delivery.provider || 'webhook').trim().toLowerCase();
  const resendKey = readEnv('RESEND_API_KEY');

  if (provider === 'resend' && resendKey) {
    const fromStr = formatFrom(delivery);
    if (!fromStr || !delivery.from_email) {
      log('transactionalEmail: resend selected but from_email missing — falling back to webhook/none');
    } else {
      const body: {
        from: string;
        to: string[];
        subject: string;
        html: string;
        text?: string;
        reply_to?: string;
      } = {
        from: fromStr,
        to: [toEmail],
        subject: String(opts.subject || ''),
        html: String(opts.html || ''),
      };
      const txt = opts.text != null ? String(opts.text) : '';
      if (txt) body.text = txt;
      const rt = String(delivery.reply_to || '').trim();
      if (rt) body.reply_to = rt;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${resendKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const raw = await res.text().catch(() => '');
      if (!res.ok) {
        throw new Error(`Resend API failed: HTTP ${res.status} ${raw.slice(0, 500)}`);
      }
      log(`transactionalEmail: sent via Resend to=${toEmail}`);
      return { ok: true, via: 'resend' };
    }
  }

  if (provider === 'none') {
    log('transactionalEmail: provider none — not sending');
    return { ok: false, via: 'none' };
  }

  const hook =
    String(delivery.webhook_url || '').trim() ||
    readEnv('WPHUB_TEAM_INVITE_EMAIL_WEBHOOK') ||
    readEnv('WPHUB_OUTBOUND_EMAIL_WEBHOOK');

  if (!hook || !hook.startsWith('http')) {
    log(
      'transactionalEmail: set email_delivery.webhook_url or WPHUB_TEAM_INVITE_EMAIL_WEBHOOK / WPHUB_OUTBOUND_EMAIL_WEBHOOK',
    );
    return { ok: false, via: 'none' };
  }

  const secret =
    readEnv('WPHUB_TEAM_INVITE_EMAIL_WEBHOOK_SECRET') || readEnv('WPHUB_OUTBOUND_EMAIL_WEBHOOK_SECRET');

  const res = await fetch(hook, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-wphub-invite-secret': secret } : {}),
    },
    body: JSON.stringify({
      to: toEmail,
      subject: String(opts.subject || ''),
      html: String(opts.html || ''),
      text: opts.text != null ? String(opts.text) : '',
    }),
  });
  const raw = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`Outbound email webhook failed: HTTP ${res.status} ${raw.slice(0, 500)}`);
  }
  log(`transactionalEmail: delivered via webhook to=${toEmail}`);
  return { ok: true, via: 'webhook' };
}

export { sendTransactionalEmail, loadEmailDeliverySettings };
