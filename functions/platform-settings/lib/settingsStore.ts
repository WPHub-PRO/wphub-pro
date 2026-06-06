import { WPHUB_APPWRITE_IDS, Query, ID } from '@code045/wphubpro-shared'

const DATABASE_ID =
  String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim() ||
  WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
const COLLECTION_ID = WPHUB_APPWRITE_IDS.platformTables.platformSettings;

function parseStoredValue(str) {
  if (str == null || str === '') return {};
  try {
    return JSON.parse(str);
  } catch {
    return { _invalidJson: true, _raw: String(str) };
  }
}

function boolFromRecord(v, key, defaultVal) {
  if (!v || typeof v !== 'object') return defaultVal;
  const s = v[key];
  if (s === undefined || s === '') return defaultVal;
  const t = String(s).toLowerCase();
  if (t === 'true' || t === '1') return true;
  if (t === 'false' || t === '0') return false;
  return defaultVal;
}

async function getSettingValueByKey(databases, key) {
  const existing = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
    Query.equal('key', key),
    Query.limit(1),
  ]);
  if (!existing.total || !existing.documents[0]) return {};
  return parseStoredValue(existing.documents[0].value);
}

async function listAllSettingsItems(databases) {
  const list = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [Query.limit(500)]);
  return (list.documents || []).map((doc) => ({
    key: doc.key,
    value: parseStoredValue(doc.value),
  }));
}

async function upsertSettingByKey(databases, key, json) {
  const k = String(key || '').trim();
  if (!k) throw new Error('platform settings key required');
  const valueStr = JSON.stringify(json);
  const existing = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
    Query.equal('key', k),
    Query.limit(1),
  ]);
  if (existing.total > 0 && existing.documents[0]) {
    await databases.updateDocument(DATABASE_ID, COLLECTION_ID, existing.documents[0].$id, {
      value: valueStr,
    });
    return;
  }
  await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), {
    key: k,
    value: valueStr,
  });
}

export {
  DATABASE_ID,
  COLLECTION_ID,
  parseStoredValue,
  boolFromRecord,
  getSettingValueByKey,
  listAllSettingsItems,
  upsertSettingByKey,
};