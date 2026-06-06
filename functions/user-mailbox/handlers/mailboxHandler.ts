import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { WPHUB_APPWRITE_IDS, platformTeamsTableId, listUserMemberships, userHasConfirmedMembershipInTeam, userIsAdmin, ok, fail, encryptMailSecretsEnvelope, decryptMailSecretsEnvelope, Query } from '@code045/wphubpro-shared'
import {
  syncTicketInboxImap,
  createTicketFromMailparserParsed,
  TICKET_IMAP_FLAG,
} from '../lib/ticketInboxSync.ts';

const DEFAULT_CONNECTION = {
  imap_host: '',
  imap_port: 993,
  imap_tls: true,
  imap_user: '',
  smtp_host: '',
  smtp_port: 587,
  smtp_tls: true,
  smtp_user: '',
  from_email: '',
  from_name: '',
};

function dbId() {
  return String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

function accountsColl() {
  return WPHUB_APPWRITE_IDS.platformTables.accounts;
}

function mailKey() {
  return String(process.env.WPHUB_MAIL_SECRETS_KEY || process.env.ENCRYPTION_KEY || '').trim();
}

function parseConnectionJson(raw) {
  if (!raw || typeof raw !== 'string') return { ...DEFAULT_CONNECTION };
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return { ...DEFAULT_CONNECTION };
    return {
      ...DEFAULT_CONNECTION,
      imap_host: String(o.imap_host ?? o.imapHost ?? '').trim(),
      imap_port: Number(o.imap_port ?? o.imapPort ?? DEFAULT_CONNECTION.imap_port) || DEFAULT_CONNECTION.imap_port,
      imap_tls: o.imap_tls !== false && o.imapTls !== false,
      imap_user: String(o.imap_user ?? o.imapUser ?? '').trim(),
      smtp_host: String(o.smtp_host ?? o.smtpHost ?? '').trim(),
      smtp_port: Number(o.smtp_port ?? o.smtpPort ?? DEFAULT_CONNECTION.smtp_port) || DEFAULT_CONNECTION.smtp_port,
      smtp_tls: o.smtp_tls !== false && o.smtpTls !== false,
      smtp_user: String(o.smtp_user ?? o.smtpUser ?? '').trim(),
      from_email: String(o.from_email ?? o.fromEmail ?? '').trim(),
      from_name: String(o.from_name ?? o.fromName ?? '').trim(),
    };
  } catch {
    return { ...DEFAULT_CONNECTION };
  }
}

function parseSecrets(cipher, key) {
  if (!cipher || typeof cipher !== 'string' || !key) {
    return { imap_password: '', smtp_password: '' };
  }
  const plain = decryptMailSecretsEnvelope(cipher.trim(), key);
  if (!plain) return { imap_password: '', smtp_password: '' };
  try {
    const o = JSON.parse(plain);
    return {
      imap_password: String(o.imap_password || '').trim(),
      smtp_password: String(o.smtp_password || '').trim(),
    };
  } catch {
    return { imap_password: '', smtp_password: '' };
  }
}

/**
 * One column `mail_settings_cipher` (preferred) or legacy `mail_connection_json` + `mail_secrets_cipher`.
 * @param {Record<string, unknown>} doc
 * @param {string} encryptionKey
 */
function loadStoredMailbox(doc, encryptionKey) {
  const unified = doc.mail_settings_cipher || doc.mailSettingsCipher;
  if (unified && typeof unified === 'string' && unified.trim() && encryptionKey) {
    const plain = decryptMailSecretsEnvelope(String(unified).trim(), encryptionKey);
    if (plain) {
      try {
        const o = JSON.parse(plain);
        if (o && typeof o === 'object') {
          const rawConn = o.connection ?? o.conn;
          const conn =
            rawConn && typeof rawConn === 'object'
              ? parseConnectionJson(JSON.stringify(rawConn))
              : { ...DEFAULT_CONNECTION };
          const s = o.secrets || o.sec || {};
          return {
            conn,
            secrets: {
              imap_password: String(s.imap_password || '').trim(),
              smtp_password: String(s.smtp_password || '').trim(),
            },
          };
        }
      } catch {
        /* fall through to legacy */
      }
    }
  }
  const legacyConn = parseConnectionJson(
    typeof doc.mail_connection_json === 'string' ? doc.mail_connection_json : doc.mailConnectionJson,
  );
  const legacyCipher = doc.mail_secrets_cipher || doc.mailSecretsCipher;
  const legacySecrets = parseSecrets(typeof legacyCipher === 'string' ? legacyCipher : '', encryptionKey);
  return { conn: legacyConn, secrets: legacySecrets };
}

async function userHasTeamOwnerRole(teams, teamId, userId) {
  const list = await teams.listMemberships({ teamId, queries: [Query.equal('userId', userId)] });
  const m = list.memberships?.[0];
  if (!m) return false;
  const roles = Array.isArray(m.roles) ? m.roles : [];
  return roles.map((r) => String(r).toLowerCase()).includes('owner');
}

async function loadAccountRow(databases, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const found = await databases.listDocuments(dbId(), accountsColl(), [
    Query.equal('user_id', uid),
    Query.limit(1),
  ]);
  return found.documents?.[0] || null;
}

async function resolveDoc(databases, teamsSdk, users, actor, workspace, teamId, platformMailboxId, log) {
  const ws = String(workspace || 'personal').toLowerCase();
  if (ws === 'platform_admin') {
    const mid = String(platformMailboxId || '').trim();
    if (!mid) return { error: 'platform_mailbox_id required for platform_admin workspace.', status: 400 };
    const admin = await userIsAdmin(users, teamsSdk, actor, log);
    if (!admin) return { error: 'Forbidden.', status: 403 };
    const encKey = mailKey();
    if (!encKey) {
      return {
        error: 'Server misconfigured: set WPHUB_MAIL_SECRETS_KEY (or ENCRYPTION_KEY) on the user-mailbox function.',
        status: 500,
      };
    }
    return loadAdminPlatformMailboxDoc(databases, mid);
  }
  if (ws === 'team') {
    const tid = String(teamId || '').trim();
    if (!tid) return { error: 'team_id required for team workspace.', status: 400 };
    const mems = await listUserMemberships(users, actor);
    if (!userHasConfirmedMembershipInTeam(mems, tid, actor)) {
      return { error: 'Not a member of this team.', status: 403 };
    }
    try {
      const doc = await databases.getDocument(dbId(), platformTeamsTableId(), tid);
      return { kind: 'team', doc, teamId: tid };
    } catch {
      return { error: 'Team metadata row not found.', status: 404 };
    }
  }
  const doc = await loadAccountRow(databases, actor);
  if (!doc) return { error: 'Account row not found.', status: 404 };
  if (String(doc.user_id || '').trim() !== actor) return { error: 'Forbidden.', status: 403 };
  return { kind: 'personal', doc };
}

async function loadAdminPlatformMailboxDoc(databases, mailboxId) {
  const settingsColl = WPHUB_APPWRITE_IDS.platformTables.platformSettings;
  const found = await databases.listDocuments(dbId(), settingsColl, [
    Query.equal('key', 'admin_workspace_inbox'),
    Query.limit(1),
  ]);
  const rawVal = found.documents?.[0]?.value;
  if (!rawVal || typeof rawVal !== 'string') {
    return { error: 'Platform admin mailboxes not configured.', status: 404 };
  }
  let parsed;
  try {
    parsed = JSON.parse(rawVal);
  } catch {
    return { error: 'Invalid admin_workspace_inbox settings.', status: 500 };
  }
  const list = Array.isArray(parsed.mailboxes) ? parsed.mailboxes : [];
  const entry = list.find((m) => String(m.id || '').trim() === String(mailboxId || '').trim());
  if (!entry || !String(entry.mail_settings_cipher || '').trim()) {
    return { error: 'Mailbox not found or missing credentials.', status: 404 };
  }
  return {
    kind: 'platform_admin',
    doc: { mail_settings_cipher: String(entry.mail_settings_cipher).trim() },
    is_ticket_inbox: Boolean(entry.is_ticket_inbox),
  };
}

function imapAuth(connection, secrets) {
  return {
    user: connection.imap_user,
    pass: secrets.imap_password || '',
  };
}

function smtpAuth(connection, secrets) {
  return {
    user: connection.smtp_user || connection.imap_user,
    pass: secrets.smtp_password || secrets.imap_password || '',
  };
}

async function openImap(connection, secrets) {
  const auth = imapAuth(connection, secrets);
  const client = new ImapFlow({
    host: connection.imap_host,
    port: Number(connection.imap_port) || 993,
    secure: Boolean(connection.imap_tls),
    auth: { user: auth.user, pass: auth.pass },
    clientInfo: {
      name: 'WPHub Pro',
      version: '1.0.0'
    },
    logger: false,
  });
  await client.connect();
  return client;
}

function passwordRule(v) {
  if (v === undefined) return 'keep';
  if (v === null) return 'clear';
  if (typeof v === 'string' && v.length === 0) return 'clear';
  if (typeof v === 'string') return 'set';
  return 'keep';
}

/** ImapFlow may set `exists` as number, BigInt, or string — never assume `typeof === 'number'`. */
function mailboxExistsCount(client) {
  const m = client && client.mailbox;
  if (!m || m.exists == null || m.exists === false) return 0;
  const n = Number(m.exists);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function pathKey(p) {
  return String(p || '').trim().toLowerCase();
}

function pathEq(a, b) {
  return pathKey(a) === pathKey(b);
}

function findSpecialPath(list, needleLc) {
  for (const m of list || []) {
    const sp = String(m.specialUse || '').toLowerCase();
    if (needleLc === 'trash' && (sp.includes('trash') || sp.includes('deleted'))) return m.path;
    if (needleLc === 'archive' && sp.includes('archive')) return m.path;
    if (needleLc === 'all' && sp.includes('all')) return m.path;
    if (needleLc === 'snooze' && sp.includes('snooze')) return m.path;
  }
  return null;
}

function resolveTrashPath(list) {
  return (
    findSpecialPath(list, 'trash') ||
    findSpecialPath(list, 'deleted') ||
    (list || []).find((m) => /(^|\/)[^/]*trash$/i.test(String(m.path || '')))?.path ||
    (list || []).find((m) => /deleted items/i.test(String(m.path || '')))?.path ||
    'Trash'
  );
}

function resolveArchivePath(list) {
  return (
    findSpecialPath(list, 'archive') ||
    findSpecialPath(list, 'all') ||
    (list || []).find((m) => /\[gmail\]\/all mail/i.test(String(m.path || '')))?.path ||
    (list || []).find((m) => /^archive$/i.test(String(m.name || '').trim()))?.path ||
    null
  );
}

function resolveSnoozePath(list) {
  return (
    (list || []).find((m) => /snooz/i.test(String(m.name || '')) || /snooz/i.test(String(m.path || '')))?.path ||
    findSpecialPath(list, 'snooze') ||
    null
  );
}

/** User tag → IMAP keyword (custom flag). */
function normalizeImapKeywordTag(raw) {
  const s = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 24);
  if (!s) return null;
  return `$WP_${s}`;
}

function messageIdHeader(parsed) {
  const mid = parsed && parsed.messageId;
  if (typeof mid === 'string') return mid.trim();
  if (mid && typeof mid === 'object' && 'value' in mid) return String(mid.value || '').trim();
  return '';
}

function referencesHeader(parsed) {
  const refs = parsed && parsed.references;
  if (!refs) return '';
  if (typeof refs === 'string') return refs.trim();
  if (Array.isArray(refs)) {
    return refs
      .map((r) => {
        if (typeof r === 'string') return r;
        if (r && typeof r === 'object' && 'value' in r) return String(r.value || '');
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

export async function handleMailbox(ctx: {
  req: Record<string, unknown>;
  res: unknown;
  log: (...args: unknown[]) => void;
  databases: import('node-appwrite').Databases;
  users: import('node-appwrite').Users;
  teams: import('node-appwrite').Teams;
  payload: Record<string, unknown>;
  actor: string;
}) {
    const { res, log, databases, users, teams, payload, actor } = ctx;
    const action = String(payload.action || '')
      .trim()
      .toLowerCase()
      .replace(/-/g, '_');
    const workspace = String(payload.workspace || 'personal').toLowerCase();
    const teamId = String(payload.team_id || payload.teamId || '').trim();
    const platformMailboxId = String(payload.platform_mailbox_id || payload.platformMailboxId || '').trim();

    const debugCtx = () => {
      const o = { action: action || null, workspace };
      if (teamId) o.team_id = teamId;
      if (platformMailboxId) o.platform_mailbox_id = platformMailboxId;
      return o;
    };
    /** Log + JSON context for Appwrite executions that only show HTTP status. */
    const fail400 = (message, extra = {}) => {
      const ctx = debugCtx();
      log(
        `[user-mailbox] HTTP 400 action=${ctx.action ?? '(empty)'} workspace=${ctx.workspace} team_id=${teamId || '-'} platform_mailbox_id=${platformMailboxId || '-'} message=${message}`,
      );
      return fail(res, message, 400, { ...ctx, ...extra });
    };

    if (!actor) return fail(res, 'Unauthorized.', 401);
    if (workspace === 'team' && !teamId) return fail400('team_id required when workspace is team.');
    if (workspace === 'platform_admin' && !platformMailboxId) {
      return fail400('platform_mailbox_id required when workspace is platform_admin.');
    }

    const resolved = await resolveDoc(databases, teams, users, actor, workspace, teamId, platformMailboxId, log);
    if (resolved.error) {
      const st = resolved.status || 400;
      if (st === 400) {
        log(
          `[user-mailbox] HTTP 400 (resolveDoc) action=${action || '(empty)'} workspace=${workspace} team_id=${teamId || '-'} platform_mailbox_id=${platformMailboxId || '-'} message=${resolved.error}`,
        );
        return fail(res, resolved.error, st, debugCtx());
      }
      return fail(res, resolved.error, st);
    }

    const key = mailKey();
    const doc = resolved.doc;
    const { conn, secrets } = loadStoredMailbox(doc, key);

    /** @returns {Promise<unknown | null>} response to return, or null if allowed */
    const blockIfTeamSaveNotOwner = async () => {
      if (resolved.kind !== 'team') return null;
      const okOwner = await userHasTeamOwnerRole(teams, resolved.teamId, actor);
      if (!okOwner) return fail(res, 'Only team owners can change mailbox settings.', 403);
      return null;
    };

    const workspaceKindForResponse = () => {
      if (resolved.kind === 'team') return 'team';
      if (resolved.kind === 'platform_admin') return 'platform_admin';
      return 'personal';
    };

    try {
      switch (action) {
        case 'get_settings': {
          const configured = Boolean(conn.imap_host && conn.imap_user && secrets.imap_password);
          return ok(res, {
            success: true,
            workspace: workspaceKindForResponse(),
            team_id: resolved.kind === 'team' ? resolved.teamId : null,
            configured,
            connection: conn,
            has_imap_password: Boolean(secrets.imap_password),
            has_smtp_password: Boolean(secrets.smtp_password),
          });
        }

        case 'save_settings': {
          if (resolved.kind === 'platform_admin') {
            return fail400('Edit platform mailboxes under Admin → Platform settings.');
          }
          const denied = await blockIfTeamSaveNotOwner();
          if (denied) return denied;
          if (!key) {
            return fail(
              res,
              'Server misconfigured: set WPHUB_MAIL_SECRETS_KEY (or ENCRYPTION_KEY) on the user-mailbox function.',
              500,
            );
          }
          const incoming = payload.connection && typeof payload.connection === 'object' ? payload.connection : {};
          const nextConn = parseConnectionJson(JSON.stringify({ ...conn, ...incoming }));

          let imapPass = secrets.imap_password;
          let smtpPass = secrets.smtp_password;
          const imapRule = passwordRule(payload.imap_password);
          const smtpRule = passwordRule(payload.smtp_password);
          if (imapRule === 'set') imapPass = String(payload.imap_password);
          if (imapRule === 'clear') imapPass = '';
          if (smtpRule === 'set') smtpPass = String(payload.smtp_password);
          if (smtpRule === 'clear') smtpPass = '';

          const envelopeInner = JSON.stringify({
            v: 1,
            connection: nextConn,
            secrets: { imap_password: imapPass, smtp_password: smtpPass },
          });
          const cipher = encryptMailSecretsEnvelope(envelopeInner, key);
          if (!cipher) return fail(res, 'Could not encrypt mailbox settings.', 500);

          const patch = {
            mail_settings_cipher: cipher,
          };

          if (resolved.kind === 'personal') {
            await databases.updateDocument(dbId(), accountsColl(), doc.$id, patch);
          } else {
            await databases.updateDocument(dbId(), platformTeamsTableId(), doc.$id, patch);
          }
          return ok(res, { success: true, message: 'Saved.' });
        }

        case 'test_imap': {
          if (!conn.imap_host || !conn.imap_user || !secrets.imap_password) {
            return fail400('IMAP host, user, and password required.');
          }
          const mems = await listUserMemberships(users, actor);
          if (resolved.kind === 'team' && !userHasConfirmedMembershipInTeam(mems, resolved.teamId, actor)) {
            return fail(res, 'Forbidden.', 403);
          }
          let client;
          try {
            client = await openImap(conn, secrets);
            await client.logout();
          } catch (e) {
            log(`[user-mailbox] test_imap: ${e.message}`);
            return fail400(`IMAP failed: ${e.message || 'error'}`);
          }
          return ok(res, { success: true, message: 'IMAP connection OK.' });
        }

        case 'test_smtp': {
          if (!conn.smtp_host || !smtpAuth(conn, secrets).user) {
            return fail400('SMTP host and user required.');
          }
          const auth = smtpAuth(conn, secrets);
          if (!auth.pass) return fail400('SMTP password (or shared IMAP password) required.');
          try {
            const transporter = nodemailer.createTransport({
              host: conn.smtp_host,
              port: Number(conn.smtp_port) || 587,
              secure: Number(conn.smtp_port) === 465,
              requireTLS: Boolean(conn.smtp_tls) && Number(conn.smtp_port) !== 465,
              auth: { user: auth.user, pass: auth.pass },
              name: "appwrite-function", // Of vul hier de domeinnaam van je app in
            });
            await transporter.verify();
          } catch (e) {
            log(`[user-mailbox] test_smtp: ${e.message}`);
            return fail400(`SMTP failed: ${e.message || 'error'}`);
          }
          return ok(res, { success: true, message: 'SMTP connection OK.' });
        }

        case 'list_mailboxes': {
          const mems = await listUserMemberships(users, actor);
          if (resolved.kind === 'team' && !userHasConfirmedMembershipInTeam(mems, resolved.teamId, actor)) {
            return fail(res, 'Forbidden.', 403);
          }
          if (!conn.imap_host || !conn.imap_user || !secrets.imap_password) {
            return fail400('Mailbox not configured.');
          }
          let client;
          try {
            client = await openImap(conn, secrets);
            const tree = await client.list();
            await client.logout();
            const mailboxes = (tree || []).map((m) => ({
              path: m.path,
              name: m.name,
              special: m.specialUse || null,
            }));
            return ok(res, { success: true, mailboxes });
          } catch (e) {
            log(`[user-mailbox] list_mailboxes: ${e.message}`);
            if (client) {
              try {
                await client.logout();
              } catch {
                /* ignore */
              }
            }
            return fail400(e.message || 'IMAP list failed');
          }
        }

        case 'list_messages': {
          const mems = await listUserMemberships(users, actor);
          if (resolved.kind === 'team' && !userHasConfirmedMembershipInTeam(mems, resolved.teamId, actor)) {
            return fail(res, 'Forbidden.', 403);
          }
          if (!conn.imap_host || !conn.imap_user || !secrets.imap_password) {
            return fail400('Mailbox not configured.');
          }
          const folder = String(payload.folder || payload.mailbox || 'INBOX').trim() || 'INBOX';
          const pageSize = Math.min(100, Math.max(1, Number(payload.page_size ?? payload.pageSize) || 10));
          const page = Math.max(1, Math.floor(Number(payload.page) || 1));
          let client;
          try {
            client = await openImap(conn, secrets);
            const lock = await client.getMailboxLock(folder);
            try {
              const exists = mailboxExistsCount(client);
              const totalMessages = exists;
              const totalPages = totalMessages ? Math.ceil(totalMessages / pageSize) : 0;
              if (!exists) {
                return ok(res, {
                  success: true,
                  folder,
                  messages: [],
                  page: 1,
                  page_size: pageSize,
                  total_messages: 0,
                  total_pages: 0,
                });
              }
              /** Newest messages have highest sequence numbers; page 1 = last pageSize sequences. */
              const endSeq = exists - (page - 1) * pageSize;
              if (endSeq < 1) {
                return ok(res, {
                  success: true,
                  folder,
                  messages: [],
                  page,
                  page_size: pageSize,
                  total_messages: totalMessages,
                  total_pages: totalPages,
                });
              }
              const startSeq = Math.max(1, endSeq - pageSize + 1);
              const batch = [];
              for await (const msg of client.fetch(`${startSeq}:${endSeq}`, {
                envelope: true,
                uid: true,
                flags: true,
              })) {
                batch.push(msg);
              }
              batch.sort((a, b) => Number(b.uid) - Number(a.uid));
              const out = [];
              for (const msg of batch) {
                const env = msg.envelope || {};
                const from0 = Array.isArray(env.from) ? env.from[0] : null;
                const fn =
                  typeof from0?.name === 'string'
                    ? from0.name
                    : from0?.name && typeof from0.name === 'object' && 'value' in from0.name
                      ? String(from0.name.value || '')
                      : '';
                const fa =
                  typeof from0?.address === 'string'
                    ? from0.address
                    : from0?.address && typeof from0.address === 'object' && 'value' in from0.address
                      ? String(from0.address.value || '')
                      : String(from0?.address || '');
                out.push({
                  uid: String(msg.uid),
                  subject: env.subject || '',
                  from_name: fn,
                  from_address: fa,
                  date: env.date ? new Date(env.date).toISOString() : null,
                  seen: Boolean(msg.flags?.has('\\Seen')),
                });
              }
              return ok(res, {
                success: true,
                folder,
                messages: out,
                page,
                page_size: pageSize,
                total_messages: totalMessages,
                total_pages: totalPages,
              });
            } finally {
              lock.release();
            }
          } catch (e) {
            log(`[user-mailbox] list_messages: ${e.message}`);
            return fail400(e.message || 'IMAP fetch failed');
          } finally {
            if (client) {
              try {
                await client.logout();
              } catch {
                /* ignore */
              }
            }
          }
        }

        case 'fetch_raw': {
          const mems = await listUserMemberships(users, actor);
          if (resolved.kind === 'team' && !userHasConfirmedMembershipInTeam(mems, resolved.teamId, actor)) {
            return fail(res, 'Forbidden.', 403);
          }
          if (!conn.imap_host || !conn.imap_user || !secrets.imap_password) {
            return fail400('Mailbox not configured.');
          }
          const folder = String(payload.folder || 'INBOX').trim() || 'INBOX';
          const uid = Number(payload.uid);
          if (!uid || Number.isNaN(uid)) return fail400('uid required.');
          let client;
          try {
            client = await openImap(conn, secrets);
            const lock = await client.getMailboxLock(folder);
            try {
              const msg = await client.fetchOne(String(uid), { source: true, uid: true, flags: true }, { uid: true });
              if (!msg || !msg.source) return fail(res, 'Message not found.', 404);
              const parsed = await simpleParser(msg.source);
              let html = typeof parsed.html === 'string' ? parsed.html : '';
              if (html) {
                html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
              }
              return ok(res, {
                success: true,
                subject: parsed.subject || '',
                textPlain: parsed.text || '',
                textHtml: html,
                from: parsed.from?.text || '',
                date: parsed.date ? parsed.date.toISOString() : null,
                seen: Boolean(msg.flags?.has('\\Seen')),
                flagged: Boolean(msg.flags?.has('\\Flagged')),
                message_id: messageIdHeader(parsed),
                references: referencesHeader(parsed),
              });
            } finally {
              lock.release();
            }
          } catch (e) {
            log(`[user-mailbox] fetch_raw: ${e.message}`);
            return fail400(e.message || 'Fetch failed');
          } finally {
            if (client) {
              try {
                await client.logout();
              } catch {
                /* ignore */
              }
            }
          }
        }

        case 'message_action': {
          const mems = await listUserMemberships(users, actor);
          if (resolved.kind === 'team' && !userHasConfirmedMembershipInTeam(mems, resolved.teamId, actor)) {
            return fail(res, 'Forbidden.', 403);
          }
          if (!conn.imap_host || !conn.imap_user || !secrets.imap_password) {
            return fail400('Mailbox not configured.');
          }
          const folder = String(payload.folder || 'INBOX').trim() || 'INBOX';
          const uid = Number(payload.uid);
          if (!uid || Number.isNaN(uid)) return fail400('uid required.');
          const op = String(payload.op || payload.operation || '')
            .trim()
            .toLowerCase()
            .replace(/-/g, '_');
          const validOps = new Set([
            'delete',
            'archive',
            'snooze',
            'move',
            'mark_read',
            'mark_unread',
            'flag',
            'unflag',
            'tag_add',
            'tag_remove',
          ]);
          if (!validOps.has(op)) return fail400(`Invalid op: "${String(payload.op || payload.operation || '').trim()}".`, {
          received_op: String(payload.op || payload.operation || '').trim() || null,
        });

          let client;
          try {
            client = await openImap(conn, secrets);
            const list = await client.list();
            const trashPath = resolveTrashPath(list);
            const lock = await client.getMailboxLock(folder);
            try {
              const uidStr = String(uid);
              const uidOpts = { uid: true };

              switch (op) {
                case 'mark_read':
                  await client.messageFlagsAdd(uidStr, ['\\Seen'], uidOpts);
                  break;
                case 'mark_unread':
                  await client.messageFlagsRemove(uidStr, ['\\Seen'], uidOpts);
                  break;
                case 'flag':
                  await client.messageFlagsAdd(uidStr, ['\\Flagged'], uidOpts);
                  break;
                case 'unflag':
                  await client.messageFlagsRemove(uidStr, ['\\Flagged'], uidOpts);
                  break;
                case 'tag_add': {
                  const kw = normalizeImapKeywordTag(payload.tag);
                  if (!kw) return fail400('tag required (letters, numbers, dash, underscore).');
                  await client.messageFlagsAdd(uidStr, [kw], uidOpts);
                  break;
                }
                case 'tag_remove': {
                  const kw = normalizeImapKeywordTag(payload.tag);
                  if (!kw) return fail400('tag required.');
                  await client.messageFlagsRemove(uidStr, [kw], uidOpts);
                  break;
                }
                case 'delete': {
                  if (pathEq(folder, trashPath)) {
                    await client.messageFlagsAdd(uidStr, ['\\Deleted'], uidOpts);
                    await client.messageDelete(uidStr, uidOpts);
                  } else {
                    const moved = await client.messageMove(uidStr, trashPath, uidOpts);
                    if (moved === false) throw new Error('Move to Trash failed.');
                  }
                  break;
                }
                case 'archive': {
                  const arch = resolveArchivePath(list);
                  if (!arch) return fail400('No archive mailbox found (no Archive / All Mail special-use).');
                  if (pathEq(folder, arch)) return fail400('Already in archive mailbox.');
                  const moved = await client.messageMove(uidStr, arch, uidOpts);
                  if (moved === false) throw new Error('Archive move failed.');
                  break;
                }
                case 'snooze': {
                  const sn = resolveSnoozePath(list);
                  if (!sn) {
                    return fail400(
                      'No snooze folder found. Create a mailbox whose name contains "Snooze" (or similar).',
                    );
                  }
                  if (pathEq(folder, sn)) return fail400('Already in snooze mailbox.');
                  const moved = await client.messageMove(uidStr, sn, uidOpts);
                  if (moved === false) throw new Error('Snooze move failed.');
                  break;
                }
                case 'move': {
                  const target = String(payload.target_folder || payload.targetFolder || '').trim();
                  if (!target) return fail400('target_folder required.');
                  if (pathEq(folder, target)) return fail400('Source and target folder are the same.');
                  const moved = await client.messageMove(uidStr, target, uidOpts);
                  if (moved === false) throw new Error('Move failed.');
                  break;
                }
                default:
                  return fail400('Invalid op (internal switch).');
              }
              return ok(res, { success: true });
            } finally {
              lock.release();
            }
          } catch (e) {
            log(`[user-mailbox] message_action: ${e.message}`);
            return fail400(e.message || 'message_action failed');
          } finally {
            if (client) {
              try {
                await client.logout();
              } catch {
                /* ignore */
              }
            }
          }
        }

        case 'sync_ticket_inbox': {
          if (resolved.kind !== 'platform_admin') {
            return fail400('sync_ticket_inbox is only for platform admin mailboxes.');
          }
          if (!resolved.is_ticket_inbox) {
            return fail400(
              'This mailbox is not marked as a ticket inbox. Enable it under Admin → Platform settings → Admin inbox.',
            );
          }
          if (!conn.imap_host || !conn.imap_user || !secrets.imap_password) {
            return fail400('Mailbox not configured.');
          }
          const folder = String(payload.folder || payload.mailbox || 'INBOX').trim() || 'INBOX';
          const maxMessages = Math.min(50, Math.max(1, Number(payload.max_messages ?? payload.maxMessages) || 25));
          let client;
          try {
            client = await openImap(conn, secrets);
            const result = await syncTicketInboxImap({
              client,
              folder,
              databases,
              users,
              actor,
              log,
              maxMessages,
            });
            return ok(res, { success: true, ...result });
          } catch (e) {
            log(`[user-mailbox] sync_ticket_inbox: ${e.message}`);
            return fail400(e.message || 'sync_ticket_inbox failed');
          } finally {
            if (client) {
              try {
                await client.logout();
              } catch {
                /* ignore */
              }
            }
          }
        }

        case 'create_ticket_from_message': {
          if (resolved.kind !== 'platform_admin') {
            return fail400('create_ticket_from_message is only for platform admin mailboxes.');
          }
          if (!resolved.is_ticket_inbox) {
            return fail400(
              'This mailbox is not marked as a ticket inbox. Enable it under Admin → Platform settings → Admin inbox.',
            );
          }
          if (!conn.imap_host || !conn.imap_user || !secrets.imap_password) {
            return fail400('Mailbox not configured.');
          }
          const folder = String(payload.folder || 'INBOX').trim() || 'INBOX';
          const uid = Number(payload.uid);
          if (!uid || Number.isNaN(uid)) return fail400('uid required.');
          let client;
          try {
            client = await openImap(conn, secrets);
            const lock = await client.getMailboxLock(folder);
            try {
              const meta = await client.fetchOne(String(uid), { uid: true, flags: true }, { uid: true });
              if (!meta) return fail(res, 'Message not found.', 404);
              if (meta.flags && meta.flags.has(TICKET_IMAP_FLAG)) {
                return fail400('This message was already imported as a ticket (IMAP tag present).');
              }
              const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
              if (!msg || !msg.source) return fail(res, 'Message not found.', 404);
              const parsed = await simpleParser(msg.source);
              const ticket = await createTicketFromMailparserParsed(databases, users, {
                parsed,
                folder,
                uid,
                actor,
              });
              await client.messageFlagsAdd(String(uid), [TICKET_IMAP_FLAG], { uid: true });
              return ok(res, {
                success: true,
                ticket_id: ticket.$id,
                reporter_user_id: ticket.user_id || null,
                guest_from_email: ticket.guest_from_email || null,
              });
            } finally {
              lock.release();
            }
          } catch (e) {
            log(`[user-mailbox] create_ticket_from_message: ${e.message}`);
            if (e && e.code === 'MISSING_FROM') return fail400(e.message);
            return fail400(e.message || 'create_ticket_from_message failed');
          } finally {
            if (client) {
              try {
                await client.logout();
              } catch {
                /* ignore */
              }
            }
          }
        }

        case 'send_message': {
          const to = String(payload.to || '').trim();
          const subject = String(payload.subject || '').trim();
          const text = String(payload.text || payload.text_plain || '').trim();
          const html = typeof payload.html === 'string' ? payload.html : '';
          if (!to || !subject || (!text && !html)) {
            return fail400('to, subject, and text or html required.');
          }
          if (!conn.smtp_host) return fail400('SMTP not configured.');
          const auth = smtpAuth(conn, secrets);
          if (!auth.pass) return fail400('SMTP password required.');
          const fromAddr = conn.from_email || auth.user;
          if (!fromAddr) return fail400('from_email or SMTP user required.');
          try {
            const transporter = nodemailer.createTransport({
              host: conn.smtp_host,
              port: Number(conn.smtp_port) || 587,
              secure: Number(conn.smtp_port) === 465,
              requireTLS: Boolean(conn.smtp_tls) && Number(conn.smtp_port) !== 465,
              auth: { user: auth.user, pass: auth.pass },
              name: "appwrite-function", // Of vul hier de domeinnaam van je app in (bijv. "my-app.com")
              
            });
            const mail = {
              from: conn.from_name ? `"${conn.from_name.replace(/"/g, '')}" <${fromAddr}>` : fromAddr,
              to,
              subject,
              text: text || undefined,
              html: html || undefined,
            };
            if (payload.in_reply_to || payload.inReplyTo) {
              mail.headers = {
                'In-Reply-To': String(payload.in_reply_to || payload.inReplyTo),
              };
            }
            if (payload.references || payload.References) {
              mail.headers = { ...(mail.headers || {}), References: String(payload.references || payload.References) };
            }
            const info = await transporter.sendMail(mail);
            return ok(res, { success: true, messageId: info.messageId || null });
          } catch (e) {
            log(`[user-mailbox] send_message: ${e.message}`);
            return fail400(e.message || 'Send failed');
          }
        }

        case '':
        case 'ping':
          return ok(res, {
            success: true,
            message: 'user-mailbox online.',
            actions: [
              'get_settings',
              'save_settings',
              'test_imap',
              'test_smtp',
              'list_mailboxes',
              'list_messages',
              'fetch_raw',
              'message_action',
              'sync_ticket_inbox',
              'create_ticket_from_message',
              'send_message',
            ],
          });

        default:
          return fail400(`Invalid action: "${String(payload.action ?? '').trim()}".`, {
            received_action: String(payload.action ?? '').trim() || null,
          });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`[user-mailbox] ${action}: ${msg}`);
      return fail(res, msg || 'Internal error', 500);
    }
}
