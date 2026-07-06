import { ok, fail, verifyIncomingBridgeSecret, WPHUB_APPWRITE_IDS, appwriteDatabaseId } from '@code045/wphubpro-shared';
import { notifyAfterSiteMetaSync } from '../lib/siteMetaNotifications.ts';
import { parseSiteLogData, stringifySiteLogData } from '../lib/siteLogData.ts';

export default async function handleSyncSiteMeta({ req, res, log, error, databases, users, teams, ENCRYPTION_KEY }) {
  if (!ENCRYPTION_KEY) {
    return fail(res, 'Function environment is not configured. Missing: ENCRYPTION_KEY.', 500);
  }

  const payload = req._parsedPayload || {};
  const siteId = payload.siteId || payload.site_id;
  const { secret, plugins_meta, themes_meta, wp_meta } = payload;
  if (!siteId) return fail(res, 'siteId or site_id is required.', 400);
  if (!secret || typeof secret !== 'string' || !secret.trim()) {
    return fail(res, 'secret is required in request body.', 400);
  }

  const hasPlugins = plugins_meta !== undefined && plugins_meta !== null;
  const hasThemes = themes_meta !== undefined && themes_meta !== null;
  const hasWpMeta = wp_meta !== undefined && wp_meta !== null;
  if (!hasPlugins && !hasThemes && !hasWpMeta) {
    return fail(res, 'At least one of plugins_meta, themes_meta or wp_meta is required.', 400);
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
        log(`[sites] sync_site_meta site ${siteId} has no site_secret or api_key.`);
        return fail(res, 'Site has no API key. Connect via WPHubPro Bridge first.', 400);
      }
      log(`[sites] sync_site_meta secret mismatch ${siteId}`);
      return fail(res, v.message, v.statusCode);
    }

    const updates = {};
    if (hasPlugins) {
      updates.plugins_meta = typeof plugins_meta === 'string' ? plugins_meta : JSON.stringify(plugins_meta);
    }
    if (hasThemes) {
      updates.themes_meta = typeof themes_meta === 'string' ? themes_meta : JSON.stringify(themes_meta);
    }
    if (hasWpMeta) {
      updates.wp_meta = typeof wp_meta === 'string' ? wp_meta : JSON.stringify(wp_meta);
    }

    const now = new Date().toISOString();
    const logData = parseSiteLogData(siteDoc.log_data || siteDoc.incoming_log);
    logData.incoming.push({
      type: 'meta_sync',
      time: now,
      plugins: hasPlugins,
      themes: hasThemes,
      wp_meta: hasWpMeta,
    });
    if (logData.incoming.length > 50) logData.incoming = logData.incoming.slice(-50);
    updates.log_data = stringifySiteLogData(logData);

    await databases.updateDocument(dbId, coll, siteId, updates);
    log(`[sites] sync_site_meta ${siteId}`);
    try {
      await notifyAfterSiteMetaSync(databases, users, siteDoc, updates, teams);
    } catch {
      /* best-effort notify */
    }
    return ok(res, { success: true, message: 'Sync completed.' });
  } catch (e) {
    error(`[sites] sync_site_meta: ${e.message}`);
    return fail(res, e.message, 500);
  }
}
