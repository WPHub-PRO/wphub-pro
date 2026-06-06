import * as crypto from 'node:crypto'; 
import { ID, Permission, Role, Query } from '@code045/wphubpro-shared';
import {
  ok,
  fail,
  userHasConfirmedMembershipInTeam,
  callerUserIdFromReq,
  trimStr,
  resolveWorkspaceContext,
  encryptBridgeCredential,
  WPHUB_APPWRITE_IDS,
  appwriteDatabaseId,
} from '@code045/wphubpro-shared';
import {
  normalizeSiteUrlForSites,
  workspaceDescriptorForOwner,
  workspaceDescriptorMatchesSiteDoc,
} from '../lib/siteUrlPolicy.ts';

function siteDocumentPermissions(mode, authUserId, teamId) {
  if (mode === 'team' && teamId) {
    return [
      Permission.read(Role.team(teamId)),
      Permission.update(Role.team(teamId, ['owner'])),
      Permission.delete(Role.team(teamId, ['owner'])),
    ];
  }
  return [
    Permission.read(Role.user(authUserId)),
    Permission.update(Role.user(authUserId)),
    Permission.delete(Role.user(authUserId)),
  ];
}

export default async function handleCreateSite({ req, res, error, databases, users, ENCRYPTION_KEY }) {
  if (!ENCRYPTION_KEY) {
    error('[sites] Missing ENCRYPTION_KEY');
    return fail(res, 'Function environment is not configured. Missing: ENCRYPTION_KEY test.', 500);
  }

  const payload = req._parsedPayload || {};
  const authUserId = callerUserIdFromReq(req);
  const requestedUserId = (req.query?.userId || req.query?.user_id) || payload.userId || payload.user_id;
  const site_url = normalizeSiteUrlForSites(
    (req.query?.site_url || req.query?.siteUrl) || payload.site_url || payload.siteUrl || '',
  );
  const site_name =
    (req.query?.site_name || req.query?.siteName) || payload.site_name || payload.siteName || '';
  const dbId = String(appwriteDatabaseId() || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
  const coll = WPHUB_APPWRITE_IDS.platformTables.sites;

  if (!authUserId) return fail(res, 'Authentication required.', 401);
  if (!site_url || !site_name) {
    return fail(res, 'Missing required fields: site_url, site_name', 400);
  }

  const username = payload.username || payload.user || req.query?.username || req.query?.user || null;
  const bridge_secret =
    payload.bridge_secret || payload.api_key || payload.apiKey || req.query?.bridge_secret || null;
  const api_key = bridge_secret;

  try {
    const ctx = await resolveWorkspaceContext(databases, authUserId, users);
    if (!ctx.authUserId) {
      return fail(res, 'Could not resolve account.', 400);
    }
    if (
      requestedUserId &&
      requestedUserId !== authUserId
    ) {
      return fail(res, 'Forbidden: user_id does not match authenticated user.', 403);
    }

    const attachRaw =
      payload.attach_workspace ?? payload.attachWorkspace ?? payload.workspace ?? payload.attachWorkspaceType ?? '';
    const attachTeamId = trimStr(
      payload.attach_team_id ??
        payload.attachTeamId ??
        payload.team_id_override ??
        payload.teamIdTarget ??
        '',
    );
    const attachLower = String(attachRaw).trim().toLowerCase();

    let effectiveMode = ctx.mode;
    let effectiveRowTeamId = ctx.rowTeamId;

    if (attachLower === 'personal' || attachLower === 'user') {
      effectiveMode = 'personal';
      effectiveRowTeamId = null;
    } else if (attachTeamId) {
      if (!userHasConfirmedMembershipInTeam(ctx.memberships, attachTeamId, authUserId)) {
        return fail(res, 'Forbidden: not a member of the selected team.', 403);
      }
      effectiveMode = 'team';
      effectiveRowTeamId = attachTeamId;
    } else if (attachLower === 'team' && !attachTeamId) {
      return fail(res, 'attach_team_id is required when attach_workspace is team.', 400);
    }

    const ownerDesc = workspaceDescriptorForOwner(effectiveMode, effectiveRowTeamId, authUserId);
    const sameUrl = await databases.listDocuments(dbId, coll, [Query.equal('site_url', site_url), Query.limit(100)]);
    const docs = sameUrl.documents || [];
    const foreign = docs.filter((d) => !workspaceDescriptorMatchesSiteDoc(ownerDesc, d));
    if (foreign.length) {
      return fail(res, 'This site URL is already connected to another workspace.', 409);
    }
    const existing = docs.find((d) => workspaceDescriptorMatchesSiteDoc(ownerDesc, d));
    if (existing) {
      return ok(res, {
        success: true,
        created: false,
        document: existing,
        message: 'Site with this URL already exists for this workspace.',
      });
    }

    let encryptedApiKey = '';
    const site_secret = api_key ? crypto.randomBytes(32).toString('hex') : null;
    if (api_key) {
      encryptedApiKey = encryptBridgeCredential(api_key, ENCRYPTION_KEY);
    }

    const bridgeStatusRaw = payload.bridge_status ?? payload.bridgeStatus;
    const bridge_status =
      typeof bridgeStatusRaw === 'string' && bridgeStatusRaw.trim()
        ? bridgeStatusRaw.trim()
        : api_key
          ? 'connected'
          : 'disconnected';

    const meta_data = payload.meta_data ?? payload.metaData ?? null;

    const document =
      effectiveMode === 'team' && effectiveRowTeamId
        ? {
            team_id: effectiveRowTeamId,
            site_url,
            site_name,
            username: username || '',
            bridge_status,
            ...(api_key ? { api_key: encryptBridgeCredential(api_key, ENCRYPTION_KEY) } : {}),
            ...(site_secret ? { site_secret: encryptBridgeCredential(site_secret, ENCRYPTION_KEY) } : {}),
            ...(meta_data != null ? { meta_data } : {}),
          }
        : {
            user_id: authUserId,
            site_url,
            site_name,
            username: username || '',
            bridge_status,
            ...(api_key ? { api_key: encryptBridgeCredential(api_key, ENCRYPTION_KEY) } : {}),
            ...(site_secret ? { site_secret: encryptBridgeCredential(site_secret, ENCRYPTION_KEY) } : {}),
            ...(meta_data != null ? { meta_data } : {}),
          };

    const perms = siteDocumentPermissions(effectiveMode, authUserId, effectiveRowTeamId || '');
    const created = await databases.createDocument(dbId, coll, ID.unique(), document, perms);
    if (encryptedApiKey) created.encrypted_api_key = encryptedApiKey;
    if (site_secret) created.site_secret = site_secret;
    return ok(res, { success: true, created: true, document: created, site_secret });
  } catch (e) {
    error(e.message);
    return fail(res, e.message, 500);
  }
}
