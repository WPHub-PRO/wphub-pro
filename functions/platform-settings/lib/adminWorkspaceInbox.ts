import { WPHUB_APPWRITE_IDS, encryptMailSecretsEnvelope, decryptMailSecretsEnvelope, Query, ID } from '@code045/wphubpro-shared'

const ADMIN_INBOX_KEY = 'admin_workspace_inbox';

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

function databaseId() {
  return String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

function settingsColl() {
  return WPHUB_APPWRITE_IDS.platformTables.platformSettings;
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

function loadCipherDoc(cipher, encryptionKey) {
  const unified = cipher;
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
        /* fall through */
      }
    }
  }
  return { conn: { ...DEFAULT_CONNECTION }, secrets: { imap_password: '', smtp_password: '' } };
}

function passwordRule(v) {
  if (v === undefined) return 'keep';
  if (v === null) return 'clear';
  if (typeof v === 'string' && v.length === 0) return 'clear';
  if (typeof v === 'string') return 'set';
  return 'keep';
}

async function readStoredPayload(databases) {
  const found = await databases.listDocuments(databaseId(), settingsColl(), [
    Query.equal('key', ADMIN_INBOX_KEY),
    Query.limit(1),
  ]);
  const rawVal = found.documents?.[0]?.value;
  if (!rawVal || typeof rawVal !== 'string') return { row: null, parsed: { mailboxes: [] } };
  try {
    const parsed = JSON.parse(rawVal);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.mailboxes)) {
      return { row: found.documents[0], parsed: { mailboxes: [] } };
    }
    return { row: found.documents[0], parsed };
  } catch {
    return { row: found.documents[0], parsed: { mailboxes: [] } };
  }
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} encryptionKey
 */
async function handleGetAdminWorkspaceInbox(databases, encryptionKey) {
  if (!encryptionKey) {
    return { error: 'Server misconfigured: set WPHUB_MAIL_SECRETS_KEY (or ENCRYPTION_KEY) on platform-settings.', status: 500 };
  }
  const { parsed } = await readStoredPayload(databases);
  const out = [];
  for (const m of parsed.mailboxes || []) {
    const id = String(m.id || '').trim();
    const label = String(m.label || '').trim() || id || 'Mailbox';
    const cipher = String(m.mail_settings_cipher || '').trim();
    if (!id || !cipher) continue;
    const { conn, secrets } = loadCipherDoc(cipher, encryptionKey);
    out.push({
      id,
      label,
      is_ticket_inbox: Boolean(m.is_ticket_inbox),
      connection: conn,
      has_imap_password: Boolean(secrets.imap_password),
      has_smtp_password: Boolean(secrets.smtp_password),
    });
  }
  return { success: true, mailboxes: out };
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {unknown} mailboxesIn
 * @param {string} encryptionKey
 */
async function handleSaveAdminWorkspaceInbox(databases, mailboxesIn, encryptionKey) {
  if (!encryptionKey) {
    return { error: 'Server misconfigured: set WPHUB_MAIL_SECRETS_KEY (or ENCRYPTION_KEY) on platform-settings.', status: 500 };
  }
  if (!Array.isArray(mailboxesIn)) {
    return { error: 'mailboxes must be an array.', status: 400 };
  }
  const { row, parsed: prev } = await readStoredPayload(databases);
  const prevById = new Map();
  for (const m of prev.mailboxes || []) {
    const id = String(m.id || '').trim();
    if (id) prevById.set(id, m);
  }

  const nextList = [];
  for (const raw of mailboxesIn) {
    if (!raw || typeof raw !== 'object') continue;
    let id = String(raw.id || '').trim();
    if (!id) id = ID.unique();
    const label = String(raw.label || '').trim() || id;
    const incomingConn =
      raw.connection && typeof raw.connection === 'object' ? raw.connection : {};
    const nextConn = parseConnectionJson(JSON.stringify({ ...DEFAULT_CONNECTION, ...incomingConn }));

    const prevRow = prevById.get(id);
    const prevCipher = prevRow && String(prevRow.mail_settings_cipher || '').trim();
    const { conn: prevConn, secrets: prevSecrets } = prevCipher
      ? loadCipherDoc(prevCipher, encryptionKey)
      : { conn: { ...DEFAULT_CONNECTION }, secrets: { imap_password: '', smtp_password: '' } };

    let imapPass = prevSecrets.imap_password;
    let smtpPass = prevSecrets.smtp_password;
    const imapRule = passwordRule(raw.imap_password);
    const smtpRule = passwordRule(raw.smtp_password);
    if (imapRule === 'set') imapPass = String(raw.imap_password);
    if (imapRule === 'clear') imapPass = '';
    if (smtpRule === 'set') smtpPass = String(raw.smtp_password);
    if (smtpRule === 'clear') smtpPass = '';

    const envelopeInner = JSON.stringify({
      v: 1,
      connection: { ...prevConn, ...nextConn },
      secrets: { imap_password: imapPass, smtp_password: smtpPass },
    });
    const cipher = encryptMailSecretsEnvelope(envelopeInner, encryptionKey);
    if (!cipher) {
      return { error: 'Could not encrypt mailbox credentials.', status: 500 };
    }
    const isTicketInbox =
      raw.is_ticket_inbox === true ||
      raw.is_ticket_inbox === 'true' ||
      (typeof raw.is_ticket_inbox === 'string' && raw.is_ticket_inbox.trim().toLowerCase() === 'true');
    nextList.push({ id, label, is_ticket_inbox: isTicketInbox, mail_settings_cipher: cipher });
  }

  const valueStr = JSON.stringify({ mailboxes: nextList });
  const maxLen = 190_000;
  if (valueStr.length > maxLen) {
    return { error: `Stored payload too large (max ${maxLen} chars). Remove mailboxes or shorten labels.`, status: 400 };
  }

  if (row) {
    await databases.updateDocument(databaseId(), settingsColl(), row.$id, { value: valueStr });
  } else {
    await databases.createDocument(databaseId(), settingsColl(), ID.unique(), {
      key: ADMIN_INBOX_KEY,
      value: valueStr,
    });
  }
  return { success: true, message: 'Saved.' };
}

export {
  ADMIN_INBOX_KEY,
  handleGetAdminWorkspaceInbox,
  handleSaveAdminWorkspaceInbox,
};