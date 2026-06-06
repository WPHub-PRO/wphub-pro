import { WPHUB_APPWRITE_IDS, ticketsByUserIdQueries, ticketsAllQueries } from '@code045/wphubpro-shared';

const DATABASE_ID =
  process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
const TICKETS_ID = WPHUB_APPWRITE_IDS.platformTables.tickets;

function listByUserQueries(userId, limit = 100) {
  const cap = Math.min(Number(limit) || 100, 200);
  return ticketsByUserIdQueries(userId, cap);
}

function listAllQueries(limit = 100) {
  const cap = Math.min(Number(limit) || 100, 200);
  return ticketsAllQueries(cap);
}

export {
  DATABASE_ID,
  TICKETS_ID,
  listByUserQueries,
  listAllQueries,
};
