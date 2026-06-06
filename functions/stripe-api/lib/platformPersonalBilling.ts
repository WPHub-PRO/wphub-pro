import { Query, ID, WPHUB_APPWRITE_IDS } from '@code045/wphubpro-shared';

const PERSONAL_BILLING_KEY = 'personal_billing';

function dbId() {
  return String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

function settingsColl() {
  return WPHUB_APPWRITE_IDS.platformTables.platformSettings;
}

/**
 * @param {{ databases: import('node-appwrite').Databases }} ctx
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function readPersonalBillingJson({ databases }) {
  const list = await databases.listDocuments(dbId(), settingsColl(), [
    Query.equal('key', PERSONAL_BILLING_KEY),
    Query.limit(1),
  ]);
  const raw = list.documents?.[0]?.value;
  if (raw == null || raw === '') return null;
  try {
    if (typeof raw === 'string') return JSON.parse(raw);
    if (typeof raw === 'object' && raw !== null) return { ...raw };
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {{ databases: import('node-appwrite').Databases }} ctx
 * @param {Record<string, unknown>} obj
 */
async function writePersonalBillingJson({ databases }, obj) {
  const valueStr = JSON.stringify(obj);
  const list = await databases.listDocuments(dbId(), settingsColl(), [
    Query.equal('key', PERSONAL_BILLING_KEY),
    Query.limit(1),
  ]);
  const doc = list.documents?.[0];
  if (doc && doc.$id) {
    await databases.updateDocument(dbId(), settingsColl(), doc.$id, { value: valueStr });
  } else {
    await databases.createDocument(dbId(), settingsColl(), ID.unique(), {
      key: PERSONAL_BILLING_KEY,
      value: valueStr,
    });
  }
}

export {
  readPersonalBillingJson,
  writePersonalBillingJson,
  PERSONAL_BILLING_KEY,
};
