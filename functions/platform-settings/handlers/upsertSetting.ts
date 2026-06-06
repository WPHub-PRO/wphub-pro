import { ok, fail, getPlatformSettingJson, Query, ID } from '@code045/wphubpro-shared'
import {
  getBridgeDocumentByVersion,
  isBridgeSemver,
  activeSemverFromBridgePluginJson,
} from '@code045/wphubpro-shared';
import { DATABASE_ID, COLLECTION_ID } from '../lib/settingsStore.ts';

export default async function handleUpsertSetting({ res, error, databases, payload, actionRaw }) {
  const { category, settings } = payload;

  if (!category || settings === undefined) {
    return fail(res, 'Missing category or settings (use action get or list to read all)', 400);
  }

  let toStore = settings;
  const cat = String(category || '').trim();
  if (cat === 'bridge_plugin' && settings && typeof settings === 'object' && !Array.isArray(settings)) {
    const base = await getPlatformSettingJson(databases, 'bridge_plugin');
    const incoming = settings;
    if (Object.prototype.hasOwnProperty.call(incoming, 'version')) {
      const v = String(incoming.version ?? '').trim();
      if (!v) {
        return fail(res, 'version cannot be empty', 400);
      }
      if (!isBridgeSemver(v)) {
        return fail(res, 'version must be semver x.y.z', 400);
      }
      const row = await getBridgeDocumentByVersion(databases, v);
      if (!row || !String(row.file_id || '').trim()) {
        return fail(res, 'No bridge row with that version and file_id exists in platform_db/bridge.', 400);
      }
      const prevActive = activeSemverFromBridgePluginJson(base);
      const isoNow = new Date().toISOString();
      const prevAt =
        typeof base.active_set_at === 'string' && base.active_set_at.trim()
          ? base.active_set_at.trim()
          : typeof base.uploaded_at === 'string' && base.uploaded_at.trim()
            ? base.uploaded_at.trim()
            : '';
      toStore = {
        version: v,
        active_set_at: v !== prevActive ? isoNow : prevAt || isoNow,
      };
    } else {
      toStore = { ...base, ...settings };
    }
  }

  const valueStr = JSON.stringify(toStore);
  if (valueStr.length > 120000) {
    return fail(res, 'platform_settings value exceeds maximum length (120000 characters)', 400);
  }

  const existing = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [
    Query.equal('key', category),
  ]);
  const hasDoc = existing.total > 0;
  const docId = hasDoc ? existing.documents[0].$id : null;

  const mode =
    actionRaw === 'create' || actionRaw === 'update' || actionRaw === 'upsert' ? actionRaw : 'upsert';

  if (mode === 'create' && hasDoc) {
    return fail(res, 'Settings key already exists', 409);
  }
  if (mode === 'update' && !hasDoc) {
    return fail(res, 'Settings key not found', 404);
  }

  if (hasDoc) {
    await databases.updateDocument(DATABASE_ID, COLLECTION_ID, docId, {
      value: valueStr,
    });
    return ok(res, { success: true, message: 'Settings updated' });
  }

  await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), {
    key: category,
    value: valueStr,
  });
  return ok(res, { success: true, message: 'Settings created' });
};
