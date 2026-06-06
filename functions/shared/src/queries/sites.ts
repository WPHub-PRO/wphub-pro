import * as sdk from 'node-appwrite';

/**
 * @param {string} siteId
 */
export function siteByIdQuery(siteId) {
  return [sdk.Query.equal('$id', siteId), sdk.Query.limit(1)];
}

/**
 * @param {string} userId
 * @param {number} [limit]
 */
export function sitesByUserIdQueries(userId, limit = 100) {
  return [sdk.Query.equal('user_id', userId), sdk.Query.limit(limit)];
}

/**
 * @param {string} teamId
 * @param {number} [limit]
 */
export function sitesByTeamIdQueries(teamId, limit = 100) {
  return [sdk.Query.equal('team_id', teamId), sdk.Query.limit(limit)];
}
