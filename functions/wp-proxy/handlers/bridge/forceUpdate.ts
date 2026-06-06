import {
  ok,
  fail,
  callerUserIdFromReq,
  userIsAdmin,
  Query,
  resolveActiveBridgeDownloadRow,
} from '@code045/wphubpro-shared';
import { callBridgeRest, databaseId, sitesCollectionId } from '../../lib/connectBridge.ts';
import type { WpProxyCtx } from '../../lib/types.ts';
import type { Databases } from '@code045/wphubpro-shared';

const BRIDGE_PLUGIN_PATH = 'wphubpro-bridge/wphubpro-bridge.php';
const BATCH_SIZE = 10;
const DEFAULT_DELAY_MS = 1000;

function batchDelayMs(): number {
  const raw = process.env.BRIDGE_FORCE_UPDATE_BATCH_DELAY_MS;
  const n = raw !== undefined && raw !== '' ? parseInt(String(raw), 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DELAY_MS;
}

function resolveZipDownloadUrl(endpoint: string, projectId: string, fileId: string): string {
  const baseUrl = String(endpoint).replace(/\/$/, '');
  const pid = String(projectId);
  const BRIDGE_BUCKET_ID = process.env.APPWRITE_STORAGE_BUCKET_BRIDGE_ID || 'bridge';
  return `${baseUrl}/storage/buckets/${BRIDGE_BUCKET_ID}/files/${fileId}/download?project=${encodeURIComponent(pid)}`;
}

async function listAllSiteIds(databases: Databases): Promise<string[]> {
  const dbId = databaseId();
  const sitesColl = sitesCollectionId();
  const ids: string[] = [];
  let cursor: string | null = null;
  for (;;) {
    const queries = [Query.limit(100)];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const list = await databases.listDocuments(dbId, sitesColl, queries);
    const docs = list.documents || [];
    for (const d of docs) {
      if (d && d.$id) ids.push(String(d.$id));
    }
    if (docs.length < 100) break;
    cursor = docs[docs.length - 1].$id;
  }
  return ids;
}

export default async function handleBridgeForceUpdate(ctx: WpProxyCtx) {
  const { req, res, log, error, databases, users, teams, endpoint, projectId } = ctx;

  const actorUserId = callerUserIdFromReq(req);
  if (!actorUserId) {
    return fail(
      res,
      'Unauthorized: no caller user for bridge force update. Run from the Hub as an admin, or set APPWRITE_FUNCTION_USER_ID / x-appwrite-user-id when testing in Appwrite Console.',
      401,
    );
  }

  let isAdmin = false;
  try {
    isAdmin = await userIsAdmin(users, teams, actorUserId, log);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error(`[wp-proxy] bridge/forceUpdate admin check: ${msg}`);
    return fail(res, 'Could not verify admin access.', 500);
  }
  if (!isAdmin) {
    return fail(res, 'Forbidden: Admin access required', 403);
  }

  const row = await resolveActiveBridgeDownloadRow(databases, log);
  if (!row || !row.file_id) {
    return fail(
      res,
      'No bridge package row with file_id for the active platform bridge version. Check Platform settings and bridge storage.',
      404,
    );
  }

  const downloadUrl = resolveZipDownloadUrl(endpoint, projectId, row.file_id);
  if (!downloadUrl.startsWith('https://')) {
    return fail(res, 'Invalid bridge download URL.', 500);
  }

  log(`[wp-proxy] bridge/forceUpdate using version ${row.version} (source: ${row.source})`);

  const siteIds = await listAllSiteIds(databases);
  const delayMs = batchDelayMs();
  const batchCount = siteIds.length === 0 ? 0 : Math.ceil(siteIds.length / BATCH_SIZE);

  const innerBody = {
    plugin: BRIDGE_PLUGIN_PATH,
    zip_url: downloadUrl,
  };

  for (let i = 0; i < siteIds.length; i += BATCH_SIZE) {
    const chunk = siteIds.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      chunk.map((siteId) =>
        callBridgeRest(ctx, {
          siteId,
          bridgePath: 'wphubpro/v1/plugins/manage/update',
          method: 'POST',
          body: innerBody,
          blind: true,
        }),
      ),
    );
    if (i + BATCH_SIZE < siteIds.length && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  log(`[wp-proxy] bridge/forceUpdate finished by ${actorUserId}: ${siteIds.length} sites, ${batchCount} batches`);
  return ok(res, {
    success: true,
    handler: 'bridge_force_update',
    siteCount: siteIds.length,
    batchCount,
    version: row.version,
  });
}
