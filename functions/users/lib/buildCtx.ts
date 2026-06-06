/**
 * @param {object} params
 * @param {import('node-appwrite').Client} params.client
 * @param {import('node-appwrite').Databases} params.databases
 * @param {import('node-appwrite').Users} params.users
 * @param {import('node-appwrite').Teams} params.teams
 * @param {string} params.endpoint
 * @param {string} params.projectId
 * @param {string} params.apiKey
 */
function buildCtx({ client, databases, users, teams, endpoint, projectId, apiKey }) {
  return {
    client,
    databases,
    users,
    teams,
    stripe: null,
    APPWRITE_ENDPOINT: endpoint,
    APPWRITE_PROJECT_ID: projectId,
    APPWRITE_API_KEY: apiKey,
  };
}

export { buildCtx };
