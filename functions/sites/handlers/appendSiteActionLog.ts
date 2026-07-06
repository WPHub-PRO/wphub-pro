import { ok, fail, verifyIncomingBridgeSecret, WPHUB_APPWRITE_IDS, appwriteDatabaseId } from '@code045/wphubpro-shared';
import { parseSiteLogData, stringifySiteLogData } from '../lib/siteLogData.ts';

const ACTION_LOG_MAX = 100;

type ActionLogEntry = {
  action?: string;
  endpoint?: string;
  timestamp?: string | number;
  request?: unknown;
  response?: unknown;
};

export default async function handleAppendSiteActionLog({
  req,
  res,
  log,
  error,
  databases,
  ENCRYPTION_KEY,
}: {
  req: { _parsedPayload?: Record<string, unknown> };
  res: { json: (body: unknown, status?: number) => unknown };
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  databases: { getDocument: Function; updateDocument: Function };
  ENCRYPTION_KEY: string;
}) {
  if (!ENCRYPTION_KEY) {
    return fail(res, 'Function environment is not configured. Missing: ENCRYPTION_KEY.', 500);
  }

  const payload = req._parsedPayload || {};
  const siteId = payload.siteId || payload.site_id;
  const { secret, entry } = payload;

  if (!siteId) return fail(res, 'siteId or site_id is required.', 400);
  if (!secret || typeof secret !== 'string' || !secret.trim()) {
    return fail(res, 'secret is required in request body.', 400);
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return fail(res, 'entry object is required.', 400);
  }

  const dbId = String(appwriteDatabaseId() || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
  const coll = WPHUB_APPWRITE_IDS.platformTables.sites;

  try {
    const siteDoc = await databases.getDocument(dbId, coll, siteId);
    const v = verifyIncomingBridgeSecret({
      siteDoc,
      incomingSecret: secret,
      encryptionKey: ENCRYPTION_KEY,
    });
    if (!v.ok) {
      if (v.statusCode === 400) {
        log(`[sites] append_site_action_log site ${siteId} has no site_secret or api_key.`);
        return fail(res, 'Site has no API key. Connect via WPHubPro Bridge first.', 400);
      }
      log(`[sites] append_site_action_log secret mismatch ${siteId}`);
      return fail(res, v.message, v.statusCode);
    }

    const incoming = entry as ActionLogEntry;
    const normalized: ActionLogEntry = {
      action: typeof incoming.action === 'string' ? incoming.action : '',
      endpoint: typeof incoming.endpoint === 'string' ? incoming.endpoint : '',
      timestamp:
        incoming.timestamp != null && incoming.timestamp !== ''
          ? incoming.timestamp
          : new Date().toISOString(),
      request: incoming.request ?? {},
      response: incoming.response ?? {},
    };

    const logData = parseSiteLogData(siteDoc.log_data ?? siteDoc.incoming_log);
    logData.actions.push(normalized);
    if (logData.actions.length > ACTION_LOG_MAX) {
      logData.actions = logData.actions.slice(-ACTION_LOG_MAX);
    }

    await databases.updateDocument(dbId, coll, siteId, {
      log_data: stringifySiteLogData(logData),
    });

    log(`[sites] append_site_action_log ${siteId} action=${normalized.action}`);
    return ok(res, { success: true, message: 'Action log appended.' });
  } catch (e) {
    error(`[sites] append_site_action_log: ${(e as Error).message}`);
    return fail(res, (e as Error).message, 500);
  }
}
