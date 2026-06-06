import { Functions, WPHUB_APPWRITE_IDS } from '@code045/wphubpro-shared';
import {
  listProjectVariables,
  createProjectVariable,
  updateProjectVariable,
  deleteProjectVariable,
} from './projectVariablesApi.ts';

/** All Appwrite function $id`s — used only to strip legacy per-function copies. */
const GLOBAL_FUNCTION_IDS = [
  ...new Set(Object.values(WPHUB_APPWRITE_IDS.functions)),
];

const PLATFORM_SETTINGS_KEY = 'api_env_keys';

function normalizeKey(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
}

function isValidEnvKey(key) {
  return /^[A-Z][A-Z0-9_]*$/.test(key);
}

/**
 * @param {import('node-appwrite').Client} client
 */
function functionsService(client) {
  return new Functions(client);
}

/**
 * @param {import('node-appwrite').Functions} functions
 * @param {string} functionId
 */
async function listFunctionVariables(functions, functionId) {
  const res = await functions.listVariables(functionId);
  const rows = res?.variables ?? res ?? [];
  return Array.isArray(rows) ? rows : [];
}

/**
 * Remove managed keys from every function so project globals are not overridden.
 * @param {import('node-appwrite').Client} client
 * @param {string[]} keys
 */
async function purgeKeysFromAllFunctions(client, keys) {
  if (!keys.length) return;
  const functions = functionsService(client);
  const keySet = new Set(keys.map(normalizeKey));

  for (const functionId of GLOBAL_FUNCTION_IDS) {
    const existing = await listFunctionVariables(functions, functionId);
    for (const row of existing) {
      const key = normalizeKey(row.key);
      if (!keySet.has(key)) continue;
      if (row?.$id) {
        await functions.deleteVariable(functionId, row.$id);
      }
    }
  }
}

import { getSettingValueByKey, upsertSettingByKey } from './settingsStore.ts';

async function readManagedKeys(databases) {
  const raw = await getSettingValueByKey(databases, PLATFORM_SETTINGS_KEY);
  const keys = Array.isArray(raw.keys) ? raw.keys : [];
  return keys.map(normalizeKey).filter(Boolean);
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string[]} keys
 */
async function writeManagedKeys(databases, keys) {
  const unique = [...new Set(keys.map(normalizeKey).filter(Boolean))];
  await upsertSettingByKey(databases, PLATFORM_SETTINGS_KEY, { keys: unique });
  return unique;
}

/**
 * List Appwrite project (global) variables for admin UI.
 * @param {{ client: import('node-appwrite').Client, databases: import('node-appwrite').Databases }}
 */
async function listGlobalApiEnv({ client, databases }) {
  const managedKeys = await readManagedKeys(databases);
  const vars = await listProjectVariables(client);
  const byKey = new Map(vars.map((v) => [normalizeKey(v.key), v]));

  const keys =
    managedKeys.length > 0
      ? managedKeys
      : vars.map((v) => normalizeKey(v.key)).filter((k) => isValidEnvKey(k));

  const items = keys.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      value: row ? String(row.value ?? '') : '',
      variableId: row?.$id ?? '',
    };
  });

  return {
    items,
    managedKeys: keys,
    scope: 'project',
  };
}

/**
 * Upsert/delete keys on Appwrite project global variables; strip legacy per-function copies.
 * @param {{ client: import('node-appwrite').Client, databases: import('node-appwrite').Databases, entries: { key: string, value: string }[] }}
 */
async function saveGlobalApiEnv({ client, databases, entries }) {
  const prevKeys = await readManagedKeys(databases);
  const existing = await listProjectVariables(client);
  const byKey = new Map(existing.map((v) => [normalizeKey(v.key), v]));

  const normalizedEntries = [];
  const nextKeys = [];
  for (const ent of entries || []) {
    const key = normalizeKey(ent.key);
    if (!key) continue;
    if (!isValidEnvKey(key)) {
      throw new Error(
        `Invalid environment key "${ent.key}". Use A–Z, 0–9, and underscore (e.g. GOOGLE_PAGESPEED_API_KEY).`,
      );
    }
    const value = String(ent.value ?? '').trim();
    normalizedEntries.push({ key, value });
    if (value) nextKeys.push(key);
  }

  const submittedKeySet = new Set(normalizedEntries.map((e) => e.key));
  const keysToDelete = prevKeys.filter((k) => !submittedKeySet.has(k));

  for (const key of keysToDelete) {
    const row = byKey.get(key);
    if (row?.$id) {
      await deleteProjectVariable(client, row.$id);
      byKey.delete(key);
    }
  }

  for (const { key, value } of normalizedEntries) {
    if (!value) {
      const row = byKey.get(key);
      if (row?.$id) {
        await deleteProjectVariable(client, row.$id);
        byKey.delete(key);
      }
      continue;
    }
    const row = byKey.get(key);
    if (row?.$id) {
      await updateProjectVariable(client, row.$id, { key, value, secret: false });
    } else {
      const created = await createProjectVariable(client, { key, value, secret: false });
      if (created?.$id) byKey.set(key, created);
    }
  }

  const allTouchedKeys = [
    ...new Set([
      ...normalizedEntries.map((e) => e.key),
      ...keysToDelete,
      ...prevKeys,
    ]),
  ];
  await purgeKeysFromAllFunctions(client, allTouchedKeys);

  await writeManagedKeys(databases, nextKeys);

  return {
    saved: normalizedEntries.filter((e) => e.value).length,
    deleted: keysToDelete.length,
    scope: 'project',
    keys: nextKeys,
  };
}

export {
  GLOBAL_FUNCTION_IDS,
  PLATFORM_SETTINGS_KEY,
  listGlobalApiEnv,
  saveGlobalApiEnv,
  isValidEnvKey,
  normalizeKey,
};