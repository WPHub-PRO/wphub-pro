import * as sdk from 'node-appwrite';
import { WPHUB_APPWRITE_IDS } from '../appwrite/ids.ts';
import { appwriteDatabaseId } from '../core/env.ts';

function databaseId() {
  return String(appwriteDatabaseId() || '').trim();
}

function platformSettingsColl() {
  return WPHUB_APPWRITE_IDS.platformTables.platformSettings;
}

function parseStoredValue(str) {
  if (str == null || str === '') return {};
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} key
 * @returns {Promise<Record<string, unknown>>}
 */
async function getPlatformSettingJson(databases, key) {
  const k = String(key || '').trim();
  if (!k) return {};
  const existing = await databases.listDocuments(databaseId(), platformSettingsColl(), [
    sdk.Query.equal('key', k),
    sdk.Query.limit(1),
  ]);
  if (!existing.total || !existing.documents[0]) return {};
  return parseStoredValue(existing.documents[0].value);
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} key
 * @param {Record<string, unknown>} json
 */
async function upsertPlatformSettingJson(databases, key, json) {
  const k = String(key || '').trim();
  if (!k) throw new Error('platform settings key required');
  const valueStr = JSON.stringify(json);
  if (valueStr.length > 1000) {
    throw new Error('platform_settings value exceeds column limit (1000)');
  }
  const existing = await databases.listDocuments(databaseId(), platformSettingsColl(), [
    sdk.Query.equal('key', k),
    sdk.Query.limit(1),
  ]);
  if (existing.total > 0 && existing.documents[0]) {
    await databases.updateDocument(databaseId(), platformSettingsColl(), existing.documents[0].$id, {
      value: valueStr,
    });
    return;
  }
  await databases.createDocument(databaseId(), platformSettingsColl(), sdk.ID.unique(), {
    key: k,
    value: valueStr,
  });
}

export { getPlatformSettingJson, upsertPlatformSettingJson, databaseId, platformSettingsColl };
