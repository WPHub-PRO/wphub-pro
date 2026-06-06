import * as sdk from 'node-appwrite';
import { WPHUB_APPWRITE_IDS } from '../appwrite/ids.ts';
import { appwriteDatabaseId } from '../core/env.ts';
import { getPlatformSettingJson } from '../platform/platformSettingsJson.ts';

export const BRIDGE_SETTINGS_KEY = 'bridge_plugin';
export const BRIDGE_DOC_CURRENT = 'current';

export function isBridgeSemver(v) {
  return /^\d+\.\d+\.\d+$/.test(String(v || '').trim());
}

export function compareSemver(a, b) {
  const pa = String(a || '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

export function activeSemverFromBridgePluginJson(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const v = String(parsed.version ?? parsed.active_version ?? '').trim();
  if (isBridgeSemver(v)) return v;
  return null;
}

export function bridgeLatestAdvertisedSemver(parsed) {
  return activeSemverFromBridgePluginJson(parsed);
}

export async function getBridgeDocumentByVersion(databases, semver) {
  const v = String(semver || '').trim();
  if (!isBridgeSemver(v)) return null;
  const db = String(appwriteDatabaseId() || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
  const coll = WPHUB_APPWRITE_IDS.platformTables.bridge;
  const list = await databases.listDocuments(db, coll, [sdk.Query.equal('version', v), sdk.Query.limit(5)]);
  const docs = list.documents || [];
  for (const d of docs) {
    const fid = String(d.file_id || '').trim();
    if (fid) return d;
  }
  return null;
}

export async function getBridgeCurrentDocument(databases) {
  const db = String(appwriteDatabaseId() || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
  const coll = WPHUB_APPWRITE_IDS.platformTables.bridge;
  try {
    return await databases.getDocument(db, coll, BRIDGE_DOC_CURRENT);
  } catch (e) {
    if (e.code === 404) return null;
    throw e;
  }
}

export async function resolveActiveBridgeDownloadRow(databases, log) {
  const parsed = await getPlatformSettingJson(databases, BRIDGE_SETTINGS_KEY);
  const want = activeSemverFromBridgePluginJson(parsed);
  if (want) {
    const row = await getBridgeDocumentByVersion(databases, want);
    if (row) {
      const fid = String(row.file_id || '').trim();
      const ver = String(row.version || '').trim();
      if (fid && ver) {
        return { version: ver, file_id: fid, source: 'active_row' };
      }
    }
    if (log) log(`[bridgeActiveRelease] no bridge row with file_id for active semver ${want}; falling back to current`);
  }

  const cur = await getBridgeCurrentDocument(databases);
  if (!cur) return null;
  const fid = String(cur.file_id || '').trim();
  const ver = String(cur.version || '').trim();
  if (!fid || !ver) return null;
  return { version: ver, file_id: fid, source: 'current_fallback' };
}

export async function listBridgeReleasedVersions(databases) {
  const db = String(appwriteDatabaseId() || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
  const coll = WPHUB_APPWRITE_IDS.platformTables.bridge;
  const list = await databases.listDocuments(db, coll, [sdk.Query.limit(500)]);
  const byVersion = new Map();
  for (const d of list.documents || []) {
    const ver = String(d.version || '').trim();
    const fid = String(d.file_id || '').trim();
    if (!isBridgeSemver(ver) || !fid) continue;
    const createdAt = String(d.$createdAt || d.$updatedAt || '').trim();
    const row = { version: ver, file_id: fid, document_id: String(d.$id || ''), created_at: createdAt };
    const prev = byVersion.get(ver);
    if (!prev || (createdAt && (!prev.created_at || createdAt < prev.created_at))) {
      byVersion.set(ver, row);
    }
  }
  const dedup = [...byVersion.values()];
  dedup.sort((x, y) => compareSemver(y.version, x.version));
  return dedup;
}
