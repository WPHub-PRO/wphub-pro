import * as sdk from 'node-appwrite';

/**
 * @param {string} userId
 * @param {number} [limit]
 */
export function ticketsByUserIdQueries(userId, limit = 100) {
  return [sdk.Query.equal('user_id', userId), sdk.Query.orderDesc('$updatedAt'), sdk.Query.limit(limit)];
}

/** @param {number} [limit] */
export function ticketsAllQueries(limit = 200) {
  return [sdk.Query.orderDesc('$updatedAt'), sdk.Query.limit(limit)];
}

/**
 * @param {string} ticketId
 */
export function ticketByIdQuery(ticketId) {
  return [sdk.Query.equal('$id', ticketId), sdk.Query.limit(1)];
}
