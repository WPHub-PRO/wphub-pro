import { simpleParser } from 'mailparser';
import { WPHUB_APPWRITE_IDS, stripHtmlToPlainText, Query, ID } from '@code045/wphubpro-shared'

const TICKET_IMAP_FLAG = '$WPHUB_TKT';

const DATABASE_ID = String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
const TICKETS_ID = WPHUB_APPWRITE_IDS.platformTables.tickets;
const TICKET_MESSAGES_ID = WPHUB_APPWRITE_IDS.platformTables.ticketMessages;
const TICKET_ACTIVITIES_ID = WPHUB_APPWRITE_IDS.platformTables.ticketActivities;

/**
 * @param {unknown} fromField
 */
function primaryFromAddress(fromField) {
  if (!fromField) return '';
  if (typeof fromField === 'string') {
    const m = fromField.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
    return m ? m[0].trim().toLowerCase() : '';
  }
  const first = Array.isArray(fromField) ? fromField[0] : fromField;
  const v = first && typeof first === 'object' && 'value' in first && Array.isArray(first.value) ? first.value[0] : null;
  if (v && typeof v === 'object' && v.address) return String(v.address || '').trim();
  return '';
}

/**
 * @param {import('node-appwrite').Users} users
 * @param {string} email
 */
async function findUserIdByEmail(users, email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  try {
    const list = await users.list([Query.equal('email', e), Query.limit(1)]);
    const u = list.users?.[0];
    return u && u.$id ? String(u.$id) : null;
  } catch {
    return null;
  }
}

/**
 * @param {unknown} parsed
 */
function bodyFromParsed(parsed) {
  if (!parsed || typeof parsed !== 'object') return '(no body)';
  const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
  if (text) return text.slice(0, 10000);
  let html = typeof parsed.html === 'string' ? parsed.html : '';
  if (html) {
    html = html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    const plain = stripHtmlToPlainText(html);
    if (plain) return plain.slice(0, 10000);
  }
  return '(no body)';
}

/**
 * @param {unknown} parsed
 * @param {string} folder
 * @param {number} uid
 */
function messageFingerprint(parsed, folder, uid) {
  if (!parsed || typeof parsed !== 'object') return `imap:${String(folder || 'INBOX')}:${uid}`;
  const mid = parsed.messageId;
  if (typeof mid === 'string' && mid.trim()) return mid.trim();
  if (mid && typeof mid === 'object' && 'value' in mid && String(mid.value || '').trim()) {
    return String(mid.value).trim();
  }
  return `imap:${String(folder || 'INBOX')}:${uid}`;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {{
 *   reporterId: string | null,
 *   guestFrom: string,
 *   subject: string,
 *   body: string,
 *   contextObj: Record<string, unknown>,
 *   actor: string,
 * }} p
 */
async function createTicketFromInbound(databases, p) {
  const { reporterId, guestFrom, subject, body, contextObj, actor } = p;
  const activitySummary =
    typeof p.activitySummary === 'string' && p.activitySummary.trim()
      ? p.activitySummary.trim().slice(0, 500)
      : `Ticket created from IMAP (${guestFrom || reporterId || 'unknown'})`.slice(0, 500);
  const ticketData = {
    subject: subject.slice(0, 500),
    status: 'open',
    priority: 'medium',
    notify_channel: 'platform',
    context_json: JSON.stringify(contextObj).slice(0, 10000),
  };
  if (reporterId) {
    ticketData.user_id = reporterId;
    ticketData.follower_ids = [reporterId];
  } else {
    ticketData.guest_from_email = guestFrom.slice(0, 320);
    ticketData.follower_ids = [];
  }

  const ticket = await databases.createDocument(DATABASE_ID, TICKETS_ID, ID.unique(), ticketData);

  const messageData = {
    ticket_id: ticket.$id,
    body,
    is_staff: false,
  };
  if (reporterId) {
    messageData.user_id = reporterId;
  } else {
    messageData.guest_from_email = guestFrom.slice(0, 320);
  }

  await databases.createDocument(DATABASE_ID, TICKET_MESSAGES_ID, ID.unique(), messageData);

  await databases.createDocument(DATABASE_ID, TICKET_ACTIVITIES_ID, ID.unique(), {
    ticket_id: ticket.$id,
    actor_user_id: actor,
    action: 'ticket_created',
    summary: activitySummary,
  });

  return ticket;
}

/**
 * Create a platform ticket from an already-parsed inbound mail (manual admin action).
 * Same mapping as IMAP sync: subject→title, body→message, reporter from From.
 * @param {import('node-appwrite').Databases} databases
 * @param {import('node-appwrite').Users} users
 * @param {{ parsed: object, folder: string, uid: number, actor: string }} args
 */
async function createTicketFromMailparserParsed(databases, users, args) {
  const { parsed, folder, uid, actor } = args;
  const guestFrom = primaryFromAddress(parsed.from);
  if (!guestFrom) {
    const err = new Error('missing From address');
    err.code = 'MISSING_FROM';
    throw err;
  }
  const reporterId = await findUserIdByEmail(users, guestFrom);
  const subject = String(parsed.subject || '(no subject)').trim() || '(no subject)';
  const body = bodyFromParsed(parsed);
  const fp = messageFingerprint(parsed, folder, uid);
  const contextObj = {
    source: 'manual_mailbox_ticket',
    folder,
    uid,
    messageFingerprint: fp,
  };
  return createTicketFromInbound(databases, {
    reporterId,
    guestFrom,
    subject,
    body,
    contextObj,
    actor,
    activitySummary: `Ticket created from admin mailbox (${guestFrom || reporterId || 'unknown'})`,
  });
}

/**
 * @param {object} opts
 * @param {import('imapflow').ImapFlow} opts.client
 * @param {string} opts.folder
 * @param {import('node-appwrite').Databases} opts.databases
 * @param {import('node-appwrite').Users} opts.users
 * @param {string} opts.actor
 * @param {(s: string) => void} opts.log
 * @param {number} opts.maxMessages
 */
async function syncTicketInboxImap(opts) {
  const { client, folder, databases, users, actor, log, maxMessages } = opts;
  const lock = await client.getMailboxLock(folder);
  const imported = [];
  const skipped = [];
  const errors = [];
  try {
    let uids = await client.search({ seen: false }, { uid: true });
    if (!Array.isArray(uids)) {
      uids = uids ? [uids] : [];
    }
    const sorted = uids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
    sorted.sort((a, b) => a - b);

    const uidOpts = { uid: true };
    let n = 0;
    for (const uid of sorted) {
      if (n >= maxMessages) break;
      let meta;
      try {
        meta = await client.fetchOne(String(uid), { uid: true, flags: true }, { uid: true });
      } catch (e) {
        errors.push({ uid, error: e.message || 'fetch meta failed' });
        continue;
      }
      if (!meta) {
        skipped.push({ uid, reason: 'not_found' });
        continue;
      }
      if (meta.flags && meta.flags.has(TICKET_IMAP_FLAG)) {
        skipped.push({ uid, reason: 'already_imported' });
        continue;
      }

      let msg;
      try {
        msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
      } catch (e) {
        errors.push({ uid, error: e.message || 'fetch source failed' });
        continue;
      }
      if (!msg || !msg.source) {
        errors.push({ uid, error: 'empty source' });
        continue;
      }

      let parsed;
      try {
        parsed = await simpleParser(msg.source);
      } catch (e) {
        errors.push({ uid, error: e.message || 'parse failed' });
        continue;
      }

      const guestFrom = primaryFromAddress(parsed.from);
      if (!guestFrom) {
        errors.push({ uid, error: 'missing From address' });
        continue;
      }

      const reporterId = await findUserIdByEmail(users, guestFrom);
      const subject = String(parsed.subject || '(no subject)').trim() || '(no subject)';
      const body = bodyFromParsed(parsed);
      const fp = messageFingerprint(parsed, folder, uid);
      const contextObj = {
        source: 'imap_ticket_inbox',
        folder,
        uid,
        messageFingerprint: fp,
      };

      try {
        const ticket = await createTicketFromInbound(databases, {
          reporterId,
          guestFrom,
          subject,
          body,
          contextObj,
          actor,
        });
        await client.messageFlagsAdd(String(uid), [TICKET_IMAP_FLAG], uidOpts);
        imported.push({ uid, ticket_id: ticket.$id, reporter_user_id: reporterId, guest_from_email: reporterId ? null : guestFrom });
        n += 1;
      } catch (e) {
        log(`[user-mailbox] sync_ticket_inbox uid=${uid}: ${e.message}`);
        errors.push({ uid, error: e.message || 'create ticket failed' });
      }
    }

    return {
      folder,
      examined: sorted.length,
      imported_count: imported.length,
      imported,
      skipped,
      errors,
    };
  } finally {
    lock.release();
  }
}

export { TICKET_IMAP_FLAG, syncTicketInboxImap, createTicketFromMailparserParsed };
