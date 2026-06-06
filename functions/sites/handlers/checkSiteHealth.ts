/**
 * User JWT: POST `wphubpro/v1/health/push` on the site (same as frontend wp-proxy health refresh).
 */
import { ok, fail, resolveWorkspaceContext, sessionCanAccessSiteDocument, resolveOutboundBridgeSecret, WPHUB_APPWRITE_IDS, appwriteDatabaseId, appwriteEndpoint, appwriteProjectId } from '@code045/wphubpro-shared';
import { verifyJwtUser } from '../lib/jwt.ts';
import { normalizeSiteUrl } from '../lib/bridgeWp.ts';

export default async function handleCheckSiteHealth({
  req,
  res,
  log,
  error,
  databases,
  users,
  ENCRYPTION_KEY,
  fetch,
}) {
  const payload = req._parsedPayload || {};
  const siteId = payload.siteId || payload.site_id;
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

    const bridgeSecret = resolveOutboundBridgeSecret(siteDoc, ENCRYPTION_KEY);
    if (!bridgeSecret) {
      return fail(res, 'Site has no API key. Connect via WPHubPro Bridge first.', 400);
    }

    const siteUrl = normalizeSiteUrl(siteDoc.site_url || siteDoc.siteUrl || '');
    if (!siteUrl) return fail(res, 'Site has no site_url.', 400);

    const wpAdminLogin = (siteDoc.username || siteDoc.user_login || '').toString().trim();
    const url = `${siteUrl}/wp-json/wphubpro/v1/health/push`;
    const body = { bridge_secret: bridgeSecret };
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-WPHub-Key': bridgeSecret,
      'User-Agent': 'WPHub-ManageSites/1.0',
    };
    if (wpAdminLogin) headers['X-WPHub-Admin-Login'] = wpAdminLogin;

    log(`[sites] check_site_health POST health/push`);
    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await resp.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 500) };
    }
    if (!resp.ok) {
      const msg =
        data && typeof data === 'object' && typeof data.message === 'string'
          ? data.message
          : `WordPress returned HTTP ${resp.status}`;
      return fail(res, msg, resp.status >= 400 && resp.status < 600 ? resp.status : 502, {
        success: false,
        details: data,
      });
    }
    return ok(res, data && typeof data === 'object' ? data : { success: true, data });
  } catch (e) {
    error(`[sites] check_site_health: ${e.message}`);
    return fail(res, e.message, 500);
  }
}
