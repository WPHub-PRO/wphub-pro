import {
  ok,
  fail,
  resolveWorkspaceContext,
  sessionCanAccessSiteDocument,
  verifyIncomingBridgeSecret,
  resolveOutboundBridgeSecret,
  WPHUB_APPWRITE_IDS,
  appwriteDatabaseId,
  appwriteEndpoint,
  appwriteProjectId,
} from '@code045/wphubpro-shared';
import { verifyJwtUser } from '../lib/jwt.ts';
import { normalizeSiteUrl } from '../lib/bridgeWp.ts';
import { notifySiteOwnerTemplate } from '../lib/siteMetaNotifications.ts';
import {
  normalizeSiteUrlForSites,
  workspaceDescriptorFromSiteDoc,
  findForeignWorkspaceSiteUrlConflict,
} from '../lib/siteUrlPolicy.ts';

export default async function handleConnectSite({
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
  const payload = req._parsedPayload || {};
  const siteId = payload.siteId || payload.site_id;
  if (!siteId) return fail(res, 'siteId is required.', 400);

  const dbId = String(appwriteDatabaseId() || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
  const coll = WPHUB_APPWRITE_IDS.platformTables.sites;

  let siteDoc;
  try {
    const endpoint = appwriteEndpoint();
    const projectId = appwriteProjectId();
    const { userId } = await verifyJwtUser(req, payload, endpoint, projectId);
    siteDoc = await databases.getDocument(dbId, coll, siteId);
    const ctx = await resolveWorkspaceContext(databases, userId, users);
    if (!sessionCanAccessSiteDocument(ctx, siteDoc, users)) {
      const err = new Error('Site does not belong to this user.');
      err.code = 403;
      throw err;
    }
  } catch (e) {
    if (e && e.code === 403) {
      return fail(res, e.message || 'Forbidden', 403);
    }
    const secret = (payload.secret || '').toString().trim();
    if (!secret || !ENCRYPTION_KEY) {
      return fail(res, e.message || 'Unauthorized', 401);
    }
    try {
      siteDoc = await databases.getDocument(dbId, coll, siteId);
    } catch (se) {
      return fail(res, se.message || 'Site not found.', 404);
    }
    const v = verifyIncomingBridgeSecret({
      siteDoc,
      incomingSecret: secret,
      encryptionKey: ENCRYPTION_KEY,
    });
    if (!v.ok) {
      const code = v.statusCode === 400 ? 400 : 401;
      return fail(res, v.message, code);
    }
    log(`[sites] connect_site authenticated via site secret for ${siteId}`);
  }

  try {
    const bridgeSecret = resolveOutboundBridgeSecret(siteDoc, ENCRYPTION_KEY);
    if (!bridgeSecret) {
      return fail(res, 'Site has no API key. Add bridge credentials first.', 400);
    }

    const storageUrl = normalizeSiteUrlForSites(siteDoc.site_url || siteDoc.siteUrl || '');
    if (!storageUrl) return fail(res, 'Site has no site_url.', 400);

    const ownerDesc = workspaceDescriptorFromSiteDoc(siteDoc);
    const urlConflict = await findForeignWorkspaceSiteUrlConflict(
      databases,
      dbId,
      coll,
      storageUrl,
      ownerDesc,
      siteId,
    );
    if (urlConflict) {
      return fail(res, 'This site URL is already connected to another workspace.', 409);
    }

    const siteUrl = normalizeSiteUrl(siteDoc.site_url || siteDoc.siteUrl || '');
    if (!siteUrl) return fail(res, 'Site has no site_url.', 400);

    const wpAdminLogin = (siteDoc.username || siteDoc.user_login || '').toString().trim();
    const body = {
      ...(payload.body && typeof payload.body === 'object' && !Array.isArray(payload.body) ? payload.body : {}),
      api_key: bridgeSecret,
    };
    if (wpAdminLogin) body.username = wpAdminLogin;

    const url = `${siteUrl}/wp-json/wphubpro/v1/save-connection`;
    log(`[sites] connect_site POST ${url.replace(/\/\/[^/]+/, '//…')}`);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-WPHub-Key': bridgeSecret,
        'X-WPHub-Execution': 'sites',
        'User-Agent': 'WPHub-ManageSites/1.0',
      },
      body: JSON.stringify(body),
    });
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
      try {
        await notifySiteOwnerTemplate(databases, users, siteDoc, 'site_connection_issue', {
          detail: msg.slice(0, 500),
        }, teams);
      } catch {
        /* best-effort notify */
      }
      return fail(res, msg, resp.status >= 400 && resp.status < 600 ? resp.status : 502, {
        success: false,
        details: data,
      });
    }
    return ok(res, data && typeof data === 'object' ? data : { success: true, data });
  } catch (e) {
    error(`[sites] connect_site: ${e.message}`);
    return fail(res, e.message, 500);
  }
}
