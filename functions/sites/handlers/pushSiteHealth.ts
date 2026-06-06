import { ok, fail, verifyIncomingBridgeSecret, WPHUB_APPWRITE_IDS, appwriteDatabaseId } from '@code045/wphubpro-shared';
import { notifySiteOwnerTemplate } from '../lib/siteMetaNotifications.ts';

function extractHealthSnapshot(body) {
  const skip = new Set(['site_id', 'siteId', 'secret']);
  const out = {};
  for (const [k, v] of Object.entries(body)) {
    if (!skip.has(k)) out[k] = v;
  }
  return out;
}

export default async function handlePushSiteHealth({ req, res, log, error, databases, users, teams, ENCRYPTION_KEY }) {
  if (!ENCRYPTION_KEY) {
    return fail(res, 'Function environment is not configured. Missing: ENCRYPTION_KEY.', 500);
  }

  const payload = req._parsedPayload || {};
  const siteId = payload.siteId || payload.site_id;
  const secret = payload.secret;

  if (!siteId) return fail(res, 'siteId or site_id is required.', 400);
  if (!secret || typeof secret !== 'string' || !secret.trim()) {
    return fail(res, 'secret is required in request body.', 400);
  }

  const healthSnapshot = extractHealthSnapshot(payload);
  if (!healthSnapshot || Object.keys(healthSnapshot).length === 0) {
    return fail(res, 'Health payload is empty (expected fields from get_health_status).', 400);
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
        log(`[sites] push_site_health site ${siteId} has no site_secret or api_key.`);
        return fail(res, 'Site has no API key. Connect via WPHubPro Bridge first.', 400);
      }
      log(`[sites] push_site_health secret mismatch ${siteId}`);
      return fail(res, v.message, v.statusCode);
    }

    const healthMetaJson = JSON.stringify(healthSnapshot);
    const lastChecked =
      typeof healthSnapshot.timestamp_utc === 'string' && healthSnapshot.timestamp_utc.trim()
        ? healthSnapshot.timestamp_utc.trim()
        : new Date().toISOString();

    await databases.updateDocument(dbId, coll, siteId, {
      health_meta: healthMetaJson,
      last_checked: lastChecked,
    });

    try {
      const snap =
        healthSnapshot && typeof healthSnapshot === 'object' && !Array.isArray(healthSnapshot)
          ? healthSnapshot
          : {};
      const critical =
        Number(snap.critical_count) > 0 ||
        Number(snap.critical_issues_count) > 0 ||
        String(snap.overall_status || snap.status || '').toLowerCase().includes('critical');
      if (critical) {
        await notifySiteOwnerTemplate(databases, users, siteDoc, 'site_health_issue', {
          detail: 'WordPress reported critical site health issue(s). Open WP Site Health for details.',
        }, teams);
      }
    } catch {
      /* best-effort notify */
    }

    log(`[sites] push_site_health stored ${siteId}`);
    return ok(res, { success: true, message: 'Site health saved.' });
  } catch (e) {
    error(`[sites] push_site_health: ${e.message}`);
    return fail(res, e.message, 500);
  }
}
