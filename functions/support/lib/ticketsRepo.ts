import { WPHUB_APPWRITE_IDS, Query, ID } from '@code045/wphubpro-shared'

const DATABASE_ID =
  process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
const TICKETS_ID = WPHUB_APPWRITE_IDS.platformTables.tickets;
const TICKET_MESSAGES_ID = WPHUB_APPWRITE_IDS.platformTables.ticketMessages;
const TICKET_ACTIVITIES_ID = WPHUB_APPWRITE_IDS.platformTables.ticketActivities;

function qLimit(limit, fallback = 100) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0) return Query.limit(fallback);
  return Query.limit(Math.min(n, 200));
}

async function listTicketsByUser(databases, userId, limit = 100) {
  return databases.listDocuments(DATABASE_ID, TICKETS_ID, [
    Query.equal('user_id', userId),
    Query.orderDesc('$updatedAt'),
    qLimit(limit),
  ]);
}

async function listTicketsAll(databases, limit = 100) {
  return databases.listDocuments(DATABASE_ID, TICKETS_ID, [Query.orderDesc('$updatedAt'), qLimit(limit)]);
}

async function getTicket(databases, ticketId) {
  return databases.getDocument(DATABASE_ID, TICKETS_ID, ticketId);
}

async function createTicket(databases, data) {
  return databases.createDocument(DATABASE_ID, TICKETS_ID, ID.unique(), data);
}

async function updateTicket(databases, ticketId, data) {
  return databases.updateDocument(DATABASE_ID, TICKETS_ID, ticketId, data);
}

async function listMessages(databases, ticketId, limit = 200) {
  return databases.listDocuments(DATABASE_ID, TICKET_MESSAGES_ID, [
    Query.equal('ticket_id', ticketId),
    Query.orderAsc('$createdAt'),
    qLimit(limit),
  ]);
}

async function createMessage(databases, data) {
  return databases.createDocument(DATABASE_ID, TICKET_MESSAGES_ID, ID.unique(), data);
}

async function listActivities(databases, ticketId, limit = 200) {
  return databases.listDocuments(DATABASE_ID, TICKET_ACTIVITIES_ID, [
    Query.equal('ticket_id', ticketId),
    Query.orderDesc('$createdAt'),
    qLimit(limit),
  ]);
}

async function createActivity(databases, data) {
  return databases.createDocument(DATABASE_ID, TICKET_ACTIVITIES_ID, ID.unique(), data);
}

async function listRecentFromReporter(databases, userId, excludeTicketId, limit = 5) {
  const q = [Query.equal('user_id', userId), Query.orderDesc('$updatedAt'), qLimit(limit + 1, limit + 1)];
  const list = await databases.listDocuments(DATABASE_ID, TICKETS_ID, q);
  return (list.documents || []).filter((t) => t.$id !== excludeTicketId).slice(0, limit);
}

async function deleteDocumentsByTicketId(databases, collectionId, ticketId) {
  const batch = 100;
  for (;;) {
    const list = await databases.listDocuments(DATABASE_ID, collectionId, [
      Query.equal('ticket_id', ticketId),
      Query.limit(batch),
    ]);
    const docs = list.documents || [];
    if (!docs.length) break;
    for (const d of docs) {
      await databases.deleteDocument(DATABASE_ID, collectionId, d.$id);
    }
  }
}

/** Deletes ticket_messages and ticket_activities for this ticket, then the ticket row. */
async function deleteTicketCascade(databases, ticketId) {
  await deleteDocumentsByTicketId(databases, TICKET_MESSAGES_ID, ticketId);
  await deleteDocumentsByTicketId(databases, TICKET_ACTIVITIES_ID, ticketId);
  await databases.deleteDocument(DATABASE_ID, TICKETS_ID, ticketId);
}

async function reassignGuestMessagesToUser(databases, ticketId, guestEmail, userId) {
  const guestLc = String(guestEmail || '')
    .trim()
    .toLowerCase();
  if (!guestLc || !userId) return 0;
  const list = await listMessages(databases, ticketId, 500);
  let n = 0;
  for (const m of list.documents || []) {
    const ge = String(m.guest_from_email || '')
      .trim()
      .toLowerCase();
    if (ge && ge === guestLc) {
      await databases.updateDocument(DATABASE_ID, TICKET_MESSAGES_ID, m.$id, {
        user_id: userId,
        guest_from_email: null,
      });
      n += 1;
    }
  }
  return n;
}

export {
  listTicketsByUser,
  listTicketsAll,
  getTicket,
  createTicket,
  updateTicket,
  listMessages,
  createMessage,
  listActivities,
  createActivity,
  listRecentFromReporter,
  reassignGuestMessagesToUser,
  deleteTicketCascade,
};
// test