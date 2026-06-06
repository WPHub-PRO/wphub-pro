import { ID } from '@code045/wphubpro-shared';

function variablesUri(client, variableId) {
  const suffix = variableId ? `/${encodeURIComponent(variableId)}` : '';
  return new URL(`${client.config.endpoint}/project/variables${suffix}`);
}

function jsonHeaders() {
  return { 'content-type': 'application/json' };
}

/**
 * @param {import('node-appwrite').Client} client
 */
async function listProjectVariables(client) {
  const res = await client.call('get', variablesUri(client), {}, { total: 'false' });
  const rows = res?.variables ?? res ?? [];
  if (!Array.isArray(rows)) return [];
  return rows.filter((v) => {
    const rt = String(v.resourceType ?? 'project').toLowerCase();
    return rt === 'project' || !v.resourceId;
  });
}

/**
 * @param {import('node-appwrite').Client} client
 */
async function createProjectVariable(client, { key, value, secret = false }) {
  const variableId = ID.unique();
  return client.call(
    'post',
    variablesUri(client),
    jsonHeaders(),
    { variableId, key, value, secret },
  );
}

/**
 * @param {import('node-appwrite').Client} client
 */
async function updateProjectVariable(client, variableId, { key, value, secret = false }) {
  const payload = {};
  if (key !== undefined) payload.key = key;
  if (value !== undefined) payload.value = value;
  if (secret !== undefined) payload.secret = secret;
  return client.call('put', variablesUri(client, variableId), jsonHeaders(), payload);
}

/**
 * @param {import('node-appwrite').Client} client
 */
async function deleteProjectVariable(client, variableId) {
  return client.call('delete', variablesUri(client, variableId), {}, {});
}

export {
  listProjectVariables,
  createProjectVariable,
  updateProjectVariable,
  deleteProjectVariable,
};