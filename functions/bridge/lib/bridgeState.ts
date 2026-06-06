import * as crypto from 'node:crypto';
import type { Databases } from '@code045/wphubpro-shared';
import { WPHUB_APPWRITE_IDS } from '@code045/wphubpro-shared';

export const DATABASE_ID = WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
export const COLLECTION_ID = WPHUB_APPWRITE_IDS.platformTables.bridge;
export const DOC_ID = 'current';

type AppwriteErr = { code?: number; message?: string };

function errCode(e: unknown): number | undefined {
  return (e as AppwriteErr)?.code;
}

async function deleteCurrentIfExists(databases: Databases): Promise<void> {
  try {
    await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, DOC_ID);
  } catch (e) {
    if (errCode(e) !== 404) {
      throw e;
    }
  }
}

async function recreateCurrentDocument(
  databases: Databases,
  { file_id, version }: { file_id: string; version: string },
): Promise<void> {
  await deleteCurrentIfExists(databases);
  await databases.createDocument(DATABASE_ID, COLLECTION_ID, DOC_ID, {
    file_id: String(file_id || '').trim(),
    version: String(version || '').trim(),
  });
}

export function historyDocumentIdForVersion(semver: string): string {
  const v = String(semver || '').trim();
  if (!v) {
    throw new Error('historyDocumentIdForVersion: version is required');
  }
  const base = `b${v.replace(/\./g, '_')}`;
  if (base.length <= 36) return base;
  return `b${crypto.createHash('sha1').update(v, 'utf8').digest('hex').slice(0, 35)}`;
}

export async function upsertBridgeState(
  databases: Databases,
  partial: { file_id?: string | null; version?: string | null },
): Promise<void> {
  const row: { file_id?: string | null; version?: string | null } = {};
  if (partial.file_id !== undefined) row.file_id = partial.file_id;
  if (partial.version !== undefined) row.version = partial.version;

  if (Object.keys(row).length === 0) return;

  try {
    const existing = await databases.getDocument(DATABASE_ID, COLLECTION_ID, DOC_ID);
    const next = {
      file_id: row.file_id !== undefined ? row.file_id : existing.file_id,
      version: row.version !== undefined ? row.version : existing.version,
    };
    await recreateCurrentDocument(databases, {
      file_id: String(next.file_id ?? ''),
      version: String(next.version ?? ''),
    });
    const fid = String(next.file_id || '').trim();
    const ver = String(next.version || '').trim();
    if (fid && ver && partial.file_id !== undefined) {
      await ensureHistoryDocument(databases, { file_id: fid, version: ver });
    }
  } catch (e) {
    if (errCode(e) === 404) {
      await databases.createDocument(DATABASE_ID, COLLECTION_ID, DOC_ID, {
        file_id: row.file_id ?? '',
        version: row.version ?? '',
      });
      const fid = String(row.file_id ?? '').trim();
      const ver = String(row.version ?? '').trim();
      if (fid && ver && partial.file_id !== undefined) {
        await ensureHistoryDocument(databases, { file_id: fid, version: ver });
      }
    } else {
      throw e;
    }
  }
}

async function ensureHistoryDocument(
  databases: Databases,
  { file_id, version }: { file_id: string; version: string },
): Promise<void> {
  const fid = String(file_id || '').trim();
  const ver = String(version || '').trim();
  if (!fid || !ver) return;

  const hId = historyDocumentIdForVersion(ver);
  if (!hId || hId === DOC_ID) return;

  try {
    await databases.getDocument(DATABASE_ID, COLLECTION_ID, hId);
  } catch (e) {
    if (errCode(e) !== 404) {
      throw e;
    }
    try {
      await databases.createDocument(DATABASE_ID, COLLECTION_ID, hId, {
        file_id: fid,
        version: ver,
      });
    } catch (c) {
      if (errCode(c) !== 409) {
        throw c;
      }
    }
  }
}

export async function replaceCurrentWithHistory(
  databases: Databases,
  { file_id, version }: { file_id: string; version: string },
): Promise<void> {
  const fid = String(file_id || '').trim();
  const ver = String(version || '').trim();
  if (!fid || !ver) {
    throw new Error('replaceCurrentWithHistory: file_id and version are required');
  }

  let current: { file_id?: string; version?: string } | null;
  try {
    current = await databases.getDocument(DATABASE_ID, COLLECTION_ID, DOC_ID);
  } catch (e) {
    if (errCode(e) === 404) {
      current = null;
    } else {
      throw e;
    }
  }

  if (current) {
    const sameFile = String(current.file_id || '') === fid;
    const sameVer = String(current.version || '') === ver;
    if (sameFile && sameVer) {
      await recreateCurrentDocument(databases, { file_id: fid, version: ver });
      return;
    }

    const prevVer = String(current.version || '').trim();
    const prevFid = String(current.file_id || '').trim();
    if (prevVer && prevFid) {
      await ensureHistoryDocument(databases, {
        file_id: prevFid,
        version: prevVer,
      });
    }

    await recreateCurrentDocument(databases, { file_id: fid, version: ver });
    return;
  }

  try {
    await recreateCurrentDocument(databases, { file_id: fid, version: ver });
  } catch (e) {
    if (errCode(e) === 409) {
      await replaceCurrentWithHistory(databases, { file_id, version });
      return;
    }
    throw e;
  }
}
