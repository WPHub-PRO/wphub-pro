import * as sdk from 'node-appwrite';
import { WPHUB_APPWRITE_IDS } from '../appwrite/ids.ts';
import { appwriteDatabaseId } from '../core/env.ts';
import { FALLBACK_BY_EVENT } from './platformEventDefaults.ts';

function databaseId() {
  return String(appwriteDatabaseId() || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

function platformEventsColl() {
  return WPHUB_APPWRITE_IDS.platformTables.platformEvents;
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} eventKeyNorm
 */
export async function loadPlatformEvent(databases, eventKeyNorm) {
  const key = String(eventKeyNorm || '').trim().toLowerCase();
  if (!key) return null;

  try {
    const list = await databases.listDocuments(databaseId(), platformEventsColl(), [
      sdk.Query.equal('event_key', key),
      sdk.Query.limit(1),
    ]);
    const doc = list.documents?.[0];
    if (doc) {
      return {
        event_key: key,
        title: String(doc.title || key),
        category: String(doc.category || 'platform'),
        severity: String(doc.severity || 'info'),
        notification_enabled: doc.notification_enabled !== false,
        notification_title: String(doc.notification_title || ''),
        notification_body: String(doc.notification_body ?? ''),
        email_enabled: doc.email_enabled === true,
        email_template_key: String(doc.email_template_key || key),
        fromDb: true,
      };
    }
  } catch {
    /* fall through */
  }

  const fb = FALLBACK_BY_EVENT[key];
  if (!fb) return null;

  return {
    event_key: key,
    title: fb.title,
    category: fb.category,
    severity: fb.severity,
    notification_enabled: true,
    notification_title: fb.notification_title,
    notification_body: fb.notification_body,
    email_enabled: false,
    email_template_key: key,
    fromDb: false,
  };
}

export { platformEventsColl, databaseId as platformEventsDatabaseId };
