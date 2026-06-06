import { ok, fail, WPHUB_APPWRITE_IDS, databaseId, getPlatformSettingJson, upsertPlatformSettingJson, renderSystemEmail, getEmailShell, shellDocumentId, sendTransactionalEmail, Query, ID } from '@code045/wphubpro-shared'

const _emailFns = [
  ['getPlatformSettingJson', getPlatformSettingJson],
  ['upsertPlatformSettingJson', upsertPlatformSettingJson],
  ['renderSystemEmail', renderSystemEmail],
  ['getEmailShell', getEmailShell],
  ['sendTransactionalEmail', sendTransactionalEmail],
];
for (const [name, fn] of _emailFns) {
  if (typeof fn !== 'function') {
    throw new Error(
      `functions-lib is outdated: ${name} missing. Push current repo (systemEmail.js + index.js), run npm install in functions/messaging, redeploy.`
    );
  }
}
if (shellDocumentId === undefined || shellDocumentId === null) {
  throw new Error(
    'functions-lib is outdated: shellDocumentId missing. Push current repo, npm install in functions/messaging, redeploy.'
  );
}

function shellColl() {
  return WPHUB_APPWRITE_IDS.platformTables.systemEmailShell;
}

function templatesColl() {
  return WPHUB_APPWRITE_IDS.platformTables.systemEmailTemplates;
}

/** Matches `appwrite.config.json` → `system_email_shell` column size for header/footer HTML. */
const MAX_SYSTEM_EMAIL_SHELL_HTML = 100000;

/**
 * Resolve shell HTML fields from flat or nested (`payload.shell`) shapes.
 * @param {unknown} payload
 * @returns {{ header_raw: unknown; footer_raw: unknown }}
 */
function rawShellFieldsFromPayload(payload) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const shell =
    p.shell && typeof p.shell === 'object' && !Array.isArray(p.shell) ? p.shell : null;
  const header_from_shell = shell && 'header_html' in shell ? shell.header_html : undefined;
  const footer_from_shell = shell && 'footer_html' in shell ? shell.footer_html : undefined;
  return {
    header_raw: p.header_html !== undefined ? p.header_html : header_from_shell,
    footer_raw: p.footer_html !== undefined ? p.footer_html : footer_from_shell,
  };
}

/**
 * @param {unknown} raw
 * @param {string} fieldName
 * @returns {{ ok: true; value: string } | { ok: false; message: string }}
 */
function normalizeSystemEmailShellHtml(raw, fieldName) {
  if (raw == null) return { ok: true, value: '' };
  const t = typeof raw;
  if (t === 'object') {
    return {
      ok: false,
      message: `${fieldName} must be a string (got object or array); send HTML as a string.`,
    };
  }
  const value = String(raw);
  if (value.length > MAX_SYSTEM_EMAIL_SHELL_HTML) {
    return {
      ok: false,
      message: `${fieldName} must be at most ${MAX_SYSTEM_EMAIL_SHELL_HTML} characters (got ${value.length}).`,
    };
  }
  return { ok: true, value };
}

function mockPreviewContext(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const mc = p.mockContext && typeof p.mockContext === 'object' ? p.mockContext : {};
  return {
    team_name: String(mc.team_name || 'Demo Team'),
    plan_name: String(mc.plan_name || 'Pro'),
    site_name: String(mc.site_name || 'Example Site'),
    site_url: String(mc.site_url || 'https://example.com'),
    platform_title: String(mc.platform_title || 'WP Hub Pro'),
    app_url: String(mc.app_url || 'https://app.example.com'),
    user_email: String(mc.user_email || 'user@example.com'),
    recipient_name: String(mc.recipient_name || 'Alex'),
    invite_accept_url: String(mc.invite_accept_url || 'https://app.example.com/register/invite'),
    invite_decline_url: String(mc.invite_decline_url || 'https://app.example.com/invite/team?d=1'),
    invite_review_url: String(mc.invite_review_url || 'https://app.example.com/invite/team'),
  };
}

async function handleEmailShellGet(ctx) {
  const { res, databases, isAdmin } = ctx;
  if (!isAdmin) return fail(res, 'Forbidden: admin only', 403);
  const shell = await getEmailShell(databases);
  return ok(res, { success: true, shell });
}

async function handleEmailShellUpsert(ctx) {
  const { res, databases, isAdmin, payload } = ctx;
  if (!isAdmin) return fail(res, 'Forbidden: admin only', 403);
  const { header_raw, footer_raw } = rawShellFieldsFromPayload(payload);
  const headerNorm = normalizeSystemEmailShellHtml(header_raw, 'header_html');
  if (!headerNorm.ok) return fail(res, headerNorm.message, 400);
  const footerNorm = normalizeSystemEmailShellHtml(footer_raw, 'footer_html');
  if (!footerNorm.ok) return fail(res, footerNorm.message, 400);
  const header_html = headerNorm.value;
  const footer_html = footerNorm.value;
  const db = databaseId();
  const coll = shellColl();
  try {
    await databases.updateDocument(db, coll, shellDocumentId, { header_html, footer_html });
  } catch {
    await databases.createDocument(db, coll, ID.custom(shellDocumentId), {
      header_html,
      footer_html,
    });
  }
  return ok(res, { success: true });
}

async function handleEmailTemplatesList(ctx) {
  const { res, databases, isAdmin } = ctx;
  if (!isAdmin) return fail(res, 'Forbidden: admin only', 403);
  const list = await databases.listDocuments(databaseId(), templatesColl(), [Query.limit(200)]);
  const items = (list.documents || []).map((d) => ({
    $id: d.$id,
    event_key: d.event_key,
    title: d.title,
    subject: d.subject,
    body_html: d.body_html,
    enabled: d.enabled !== false,
  }));
  return ok(res, { success: true, items });
}

async function handleEmailTemplateUpsert(ctx) {
  const { res, databases, isAdmin, payload } = ctx;
  if (!isAdmin) return fail(res, 'Forbidden: admin only', 403);
  const event_key = String(payload?.event_key || '').trim().toLowerCase();
  const title = String(payload?.title || '').trim().slice(0, 256);
  const subject = String(payload?.subject || '').trim().slice(0, 512);
  const body_html = String(payload?.body_html ?? '');
  const enabled = payload?.enabled === false ? false : true;
  if (!event_key) return fail(res, 'event_key is required', 400);
  if (!title) return fail(res, 'title is required', 400);
  if (!subject) return fail(res, 'subject is required', 400);

  const db = databaseId();
  const coll = templatesColl();
  const existing = await databases.listDocuments(db, coll, [
    Query.equal('event_key', event_key),
    Query.limit(1),
  ]);
  const docId = payload?.documentId ? String(payload.documentId).trim() : '';
  if (existing.total && existing.documents[0]) {
    await databases.updateDocument(db, coll, existing.documents[0].$id, {
      title,
      subject,
      body_html,
      enabled,
    });
    return ok(res, { success: true, documentId: existing.documents[0].$id });
  }
  if (docId) {
    await databases.updateDocument(db, coll, docId, {
      event_key,
      title,
      subject,
      body_html,
      enabled,
    });
    return ok(res, { success: true, documentId: docId });
  }
  const created = await databases.createDocument(db, coll, ID.unique(), {
    event_key,
    title,
    subject,
    body_html,
    enabled,
  });
  return ok(res, { success: true, documentId: created.$id });
}

async function handleEmailPreview(ctx) {
  const { res, databases, isAdmin, payload } = ctx;
  if (!isAdmin) return fail(res, 'Forbidden: admin only', 403);
  const eventKey = String(payload?.event_key || 'team_invite').trim();
  const mock = mockPreviewContext(payload);
  try {
    const out = await renderSystemEmail(databases, eventKey, mock);
    return ok(res, {
      success: true,
      event_key: eventKey,
      subject: out.subject,
      html: out.html,
      text: out.text,
      usedDbTemplate: out.usedDbTemplate,
    });
  } catch (e) {
    return fail(res, e.message || 'Preview failed', 400);
  }
}

async function handleEmailDeliveryGet(ctx) {
  const { res, databases, isAdmin } = ctx;
  if (!isAdmin) return fail(res, 'Forbidden: admin only', 403);
  const settings = await getPlatformSettingJson(databases, 'email_delivery');
  const hasResendKey = Boolean(String(process.env.RESEND_API_KEY || '').trim());
  return ok(res, {
    success: true,
    settings,
    hasResendKey,
  });
}

async function handleEmailDeliveryUpsert(ctx) {
  const { res, databases, isAdmin, payload } = ctx;
  if (!isAdmin) return fail(res, 'Forbidden: admin only', 403);
  const provider = String(payload?.provider || 'webhook').trim().toLowerCase();
  const from_email = String(payload?.from_email || '').trim().slice(0, 255);
  const from_name = String(payload?.from_name || '').trim().slice(0, 255);
  const reply_to = String(payload?.reply_to || '').trim().slice(0, 255);
  const webhook_url = String(payload?.webhook_url || '').trim().slice(0, 512);
  const json = {
    provider: ['resend', 'webhook', 'none'].includes(provider) ? provider : 'webhook',
    from_email,
    from_name,
    reply_to,
    webhook_url,
  };
  await upsertPlatformSettingJson(databases, 'email_delivery', json);
  return ok(res, { success: true });
}

async function handleEmailTestSend(ctx) {
  const { res, databases, isAdmin, payload, log } = ctx;
  if (!isAdmin) return fail(res, 'Forbidden: admin only', 403);
  const to = String(payload?.to || '').trim().toLowerCase();
  if (!to || !to.includes('@')) return fail(res, 'Valid to email is required', 400);
  const subject = String(payload?.subject || 'WP Hub Pro — test email').slice(0, 998);
  const html =
    '<p>This is a <strong>test email</strong> from WP Hub Pro messaging settings.</p>';
  const text = 'This is a test email from WP Hub Pro messaging settings.';
  try {
    const result = await sendTransactionalEmail({
      databases,
      log,
      to,
      subject,
      html,
      text,
    });
    return ok(res, { success: result.ok, via: result.via });
  } catch (e) {
    return fail(res, e.message || 'Send failed', 502);
  }
}

export default {
  handleEmailShellGet,
  handleEmailShellUpsert,
  handleEmailTemplatesList,
  handleEmailTemplateUpsert,
  handleEmailPreview,
  handleEmailDeliveryGet,
  handleEmailDeliveryUpsert,
  handleEmailTestSend,
};