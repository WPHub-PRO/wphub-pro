import {
  ok,
  fail,
  resolveWorkspaceContext,
  sessionCanAccessSiteDocument,
  encryptBridgeCredential,
  decryptStoredCredentialField,
  WPHUB_APPWRITE_IDS,
  appwriteDatabaseId,
  appwriteEndpoint,
  appwriteProjectId,
} from '@code045/wphubpro-shared';
import { verifyJwtUser } from '../lib/jwt.ts';
import { notifyAfterSiteMetaSync } from '../lib/siteMetaNotifications.ts';

export default async function handleFetchSiteMeta({
  req,
  res,
  log,
  error,
  databases,
  users,
  teams,
  ENCRYPTION_KEY,
  fetch,
}) {
  if (!ENCRYPTION_KEY) {
    return fail(res, 'Function environment is not configured. Missing: ENCRYPTION_KEY.', 500);
  }

  const payload = req._parsedPayload || {};
  const siteId = payload.siteId || payload.site_id;
  const forceRefresh = payload.force === true || payload.forceRefresh === true;
  if (!siteId) return fail(res, 'siteId is required.', 400);

  let userId;
  try {
    const endpoint = appwriteEndpoint();
    const projectId = appwriteProjectId();
    ({ userId } = await verifyJwtUser(req, payload, endpoint, projectId));
  } catch (e) {
    return fail(res, e.message || 'Unauthorized', 401);
  }

  const dbId = String(appwriteDatabaseId() || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
  const coll = WPHUB_APPWRITE_IDS.platformTables.sites;

  try {
    const siteDoc = await databases.getDocument(dbId, coll, siteId);
    const ctx = await resolveWorkspaceContext(databases, userId, users);
    if (!sessionCanAccessSiteDocument(ctx, siteDoc, users)) {
      return fail(res, 'Site does not belong to this user.', 403);
    }

    const bridgeStatus = siteDoc.bridge_status || siteDoc.bridgeStatus || '';
    if (bridgeStatus !== 'connected') {
      return fail(res, 'Site bridge_status is not connected.', 400);
    }

    const hasPlugins = siteDoc.plugins_meta && String(siteDoc.plugins_meta).trim().length > 2;
    const hasThemes = siteDoc.themes_meta && String(siteDoc.themes_meta).trim().length > 2;
    if (hasPlugins && hasThemes && !forceRefresh) {
      return ok(res, { success: true, message: 'Site already has plugins and themes meta.', skipped: true });
    }
    const shouldFetchThemes = !hasThemes || forceRefresh;

    const siteUrl = (siteDoc.site_url || siteDoc.siteUrl || '').replace(/\/$/, '');
    if (!siteUrl) return fail(res, 'Site has no site_url.', 400);

    const rawKey = siteDoc.api_key ?? siteDoc.apiKey ?? '';
    const wpApiKey = decryptStoredCredentialField(String(rawKey), ENCRYPTION_KEY);
    if (wpApiKey === null || wpApiKey === '') {
      return fail(res, 'Site has no API key. Connect via WPHubPro Bridge first.', 400);
    }

    const encryptedApiKeyForWp = encryptBridgeCredential(wpApiKey, ENCRYPTION_KEY);
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-WPHub-Key': encryptedApiKeyForWp,
      'User-Agent': 'WPHub-ManageSites/1.0',
    };

    const updates = {};

    if (!hasPlugins) {
      const pluginsUrl = `${siteUrl}/wp-json/wphubpro/v1/plugins`;
      log(`[sites] fetch_site_meta plugins ${pluginsUrl}`);
      const pluginsRes = await fetch(pluginsUrl, { method: 'GET', headers });
      const pluginsText = await pluginsRes.text();
      if (pluginsRes.ok) {
        try {
          const pluginsMeta = JSON.parse(pluginsText);
          if (Array.isArray(pluginsMeta)) {
            updates.plugins_meta = JSON.stringify(pluginsMeta);
            log(`[sites] Fetched ${pluginsMeta.length} plugins`);
          }
        } catch (e) {
          log(`[sites] plugins parse: ${e.message}`);
        }
      } else {
        log(`[sites] plugins fetch failed: ${pluginsRes.status} ${pluginsText.slice(0, 200)}`);
      }
    }

    if (shouldFetchThemes) {
      const themesUrl = `${siteUrl}/wp-json/wphubpro/v1/themes`;
      log(`[sites] fetch_site_meta themes ${themesUrl}`);
      const themesRes = await fetch(themesUrl, { method: 'GET', headers });
      const themesText = await themesRes.text();
      if (themesRes.ok) {
        try {
          const themesMeta = JSON.parse(themesText);
          if (Array.isArray(themesMeta)) {
            const mapped = themesMeta.map((t) => ({
              stylesheet: t.slug || t.stylesheet,
              name: t.name,
              version: t.version,
              active: t.active,
              update: t.update ?? null,
            }));
            updates.themes_meta = JSON.stringify(mapped);
            log(`[sites] Fetched ${mapped.length} themes`);
          }
        } catch (e) {
          log(`[sites] themes parse: ${e.message}`);
        }
      } else {
        log(`[sites] themes fetch failed: ${themesRes.status} ${themesText.slice(0, 200)}`);
      }
    }

    if (Object.keys(updates).length === 0) {
      return ok(res, { success: true, message: 'No updates (fetch failed or already present).' });
    }

    const now = new Date().toISOString();
    const raw = siteDoc.log_data || siteDoc.incoming_log || '{}';
    let logData = { incoming: [], outgoing: [] };
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        logData.incoming = parsed;
      } else if (parsed && typeof parsed === 'object') {
        logData.incoming = Array.isArray(parsed.incoming) ? parsed.incoming : [];
        logData.outgoing = Array.isArray(parsed.outgoing) ? parsed.outgoing : [];
      }
    } catch {
      /* ignore */
    }
    logData.incoming.push({
      type: 'plugin_theme_update',
      time: now,
      plugins: !!updates.plugins_meta,
      themes: !!updates.themes_meta,
      source: 'sites:fetch_site_meta',
    });
    if (logData.incoming.length > 50) logData.incoming = logData.incoming.slice(-50);
    updates.log_data = JSON.stringify(logData);

    await databases.updateDocument(dbId, coll, siteId, updates);
    log(`[sites] fetch_site_meta updated ${siteId}`);
    try {
      await notifyAfterSiteMetaSync(databases, users, siteDoc, updates, teams);
    } catch {
      /* best-effort notify */
    }
    return ok(res, { success: true, message: 'Meta fetched and updated.' });
  } catch (e) {
    error(`[sites] fetch_site_meta: ${e.message}`);
    return fail(res, e.message, 500);
  }
}
