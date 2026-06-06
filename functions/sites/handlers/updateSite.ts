import * as crypto from 'node:crypto';

import {
  ok,
  fail,
  callerUserIdFromReq,
  trimStr,
  resolveWorkspaceContext,
  sessionCanMutateSiteDocument,
  userIsOwnerRoleOnTeam,
  encryptBridgeCredential,
  decryptBridgeCredential,
  WPHUB_APPWRITE_IDS,
  appwriteDatabaseId,
} from '@code045/wphubpro-shared';
import {
  normalizeSiteUrlForSites,
  workspaceDescriptorForOwner,
  findForeignWorkspaceSiteUrlConflict,
} from '../lib/siteUrlPolicy.ts';

export default async function handleUpdateSite({ req, res, error, databases, users, ENCRYPTION_KEY }) {
  const payload = req._parsedPayload || {};
  const authUserId = callerUserIdFromReq(req);
  const siteId = (req.query?.siteId || req.query?.site_id) || payload.siteId || payload.site_id;
  const updates = req.query?.updates || payload.updates || payload;
  const requestedUserId =
    (req.query?.userId || req.query?.user_id) ||
    payload.userId ||
    payload.user_id ||
    updates?.userId ||
    updates?.user_id;
  const dbId = String(appwriteDatabaseId() || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
  const coll = WPHUB_APPWRITE_IDS.platformTables.sites;

  if (!authUserId) return fail(res, 'Authentication required.', 401);
  if (!siteId) return fail(res, 'Missing siteId to update', 400);
  if (!updates || typeof updates !== 'object') return fail(res, 'Missing updates payload', 400);

  const hasProp = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
  const finalUpdates = {};

  let newSiteSecretPlain = null;
  if (hasProp(updates, 'api_key') || hasProp(updates, 'apiKey') || hasProp(updates, 'bridge_secret')) {
    const rawKey = hasProp(updates, 'bridge_secret')
      ? updates.bridge_secret
      : hasProp(updates, 'api_key')
        ? updates.api_key
        : updates.apiKey;
    if (rawKey === '' || rawKey === null) {
      finalUpdates.api_key = '';
      finalUpdates.site_secret = '';
    } else {
      if (!ENCRYPTION_KEY) return fail(res, 'ENCRYPTION_KEY not configured', 500);
      finalUpdates.api_key = encryptBridgeCredential(String(rawKey), ENCRYPTION_KEY);
      newSiteSecretPlain = crypto.randomBytes(32).toString('hex');
      finalUpdates.site_secret = encryptBridgeCredential(newSiteSecretPlain, ENCRYPTION_KEY);
    }
  }

  if (hasProp(updates, 'username')) finalUpdates.username = updates.username;
  else if (hasProp(updates, 'user_login')) finalUpdates.username = updates.user_login;
  else if (hasProp(updates, 'userLogin')) finalUpdates.username = updates.userLogin;

  if (hasProp(updates, 'siteName')) finalUpdates.site_name = updates.siteName;
  else if (hasProp(updates, 'site_name')) finalUpdates.site_name = updates.site_name;

  if (hasProp(updates, 'siteUrl')) finalUpdates.site_url = updates.siteUrl;
  else if (hasProp(updates, 'site_url')) finalUpdates.site_url = updates.site_url;

  if (Object.prototype.hasOwnProperty.call(finalUpdates, 'site_url')) {
    finalUpdates.site_url = normalizeSiteUrlForSites(finalUpdates.site_url);
  }

  if (hasProp(updates, 'meta_data')) finalUpdates.meta_data = updates.meta_data;
  if (hasProp(updates, 'bridge_status')) finalUpdates.bridge_status = updates.bridge_status;

  if (
    hasProp(updates, 'attach_workspace') ||
    hasProp(updates, 'attachWorkspace') ||
    hasProp(updates, 'attach_team_id') ||
    hasProp(updates, 'attachTeamId')
  ) {
    const aw = trimStr(updates.attach_workspace ?? updates.attachWorkspace ?? '');
    const tid = trimStr(updates.attach_team_id ?? updates.attachTeamId ?? '');
    if (tid) {
      finalUpdates.team_id = tid;
      finalUpdates.user_id = '';
    } else if (aw.toLowerCase() === 'personal' || aw.toLowerCase() === 'user') {
      finalUpdates.user_id = authUserId;
      finalUpdates.team_id = '';
    }
  }

  if (!Object.keys(finalUpdates).length) {
    return fail(res, 'No update fields provided', 400);
  }

  try {
    const ctx = await resolveWorkspaceContext(databases, authUserId, users);
    if (
      requestedUserId &&
      requestedUserId !== authUserId
    ) {
      return fail(res, 'Forbidden: user_id does not match authenticated user.', 403);
    }
    const existing = await databases.getDocument(dbId, coll, siteId);
    if (!sessionCanMutateSiteDocument(ctx, existing, users)) {
      return fail(res, 'Forbidden: cannot update this site.', 403);
    }

    const tidAttach = trimStr(updates.attach_team_id ?? updates.attachTeamId ?? '');
    if (tidAttach) {
      if (!userIsOwnerRoleOnTeam(ctx.memberships, tidAttach, authUserId)) {
        return fail(res, 'Forbidden: only team owners can move a site into this team.', 403);
      }
    }

    if (Object.prototype.hasOwnProperty.call(finalUpdates, 'site_url') && finalUpdates.site_url) {
      let nextTeam = trimStr(existing.team_id);
      let nextUser = trimStr(existing.user_id ?? existing.userId);
      if (Object.prototype.hasOwnProperty.call(finalUpdates, 'team_id')) {
        nextTeam = trimStr(finalUpdates.team_id);
      }
      if (Object.prototype.hasOwnProperty.call(finalUpdates, 'user_id')) {
        nextUser = trimStr(finalUpdates.user_id);
      }
      const mode = nextTeam ? 'team' : 'personal';
      const ownerDesc = workspaceDescriptorForOwner(mode, nextTeam, nextUser);
      const urlConflict = await findForeignWorkspaceSiteUrlConflict(
        databases,
        dbId,
        coll,
        finalUpdates.site_url,
        ownerDesc,
        siteId,
      );
      if (urlConflict) {
        return fail(res, 'This site URL is already connected to another workspace.', 409);
      }
    }

    const updated = await databases.updateDocument(dbId, coll, siteId, finalUpdates);
    let site_secret_plain = newSiteSecretPlain;
    if (!site_secret_plain && updated?.site_secret && typeof updated.site_secret === 'string' && ENCRYPTION_KEY) {
      const d = decryptBridgeCredential(updated.site_secret, ENCRYPTION_KEY);
      site_secret_plain = d != null ? d : '';
    }
    if (updated?.api_key && typeof updated.api_key === 'string' && ENCRYPTION_KEY) {
      const decrypted = decryptBridgeCredential(updated.api_key, ENCRYPTION_KEY);
      if (decrypted != null) {
        updated.encrypted_api_key = encryptBridgeCredential(decrypted, ENCRYPTION_KEY);
      }
    }
    return ok(res, { success: true, document: updated, site_secret: site_secret_plain });
  } catch (e) {
    error(e.message);
    return fail(res, e.message, 500);
  }
}
