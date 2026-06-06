// Version: 1.3.0 — public_hub_layout guest read for platform shell (data-* on <html>).

/**
 * platform-settings — platform settings (platform_db / platform_settings).
 * Actions: public_auth_config | public_branding | public_hub_layout | login_methods (guest);
 * bridge_plugin_version (auth read); admin: get | list | create | update | upsert |
 * list_bridge_versions | get_admin_workspace_inbox | save_admin_workspace_inbox |
 * list_api_env | save_api_env
 * (legacy: omit action with category + settings = upsert).
 */
import {
  hasAppwriteServerEnv,
  createServerClientAndDatabases,
  parsePayload,
  fail,
  callerUserIdFromReq,
  userIsAdmin,
} from '@code045/wphubpro-shared';

import handlePublicAuthConfig from './handlers/publicAuthConfig.ts';
import handlePublicBranding from './handlers/publicBranding.ts';
import handlePublicHubLayout from './handlers/publicHubLayout.ts';
import handleLoginMethods from './handlers/loginMethods.ts';
import handleBridgePluginVersion from './handlers/bridgePluginVersion.ts';
import handleListBridgeVersions from './handlers/listBridgeVersions.ts';
import handleGetAdminWorkspaceInbox from './handlers/getAdminWorkspaceInbox.ts';
import handleSaveAdminWorkspaceInbox from './handlers/saveAdminWorkspaceInbox.ts';
import handleListSettings from './handlers/listSettings.ts';
import handleUpsertSetting from './handlers/upsertSetting.ts';
import handleListApiEnv from './handlers/listApiEnv.ts';
import handleSaveApiEnv from './handlers/saveApiEnv.ts';

const PUBLIC_ACTIONS = new Set([
  'public_auth_config',
  'public_branding',
  'public_hub_layout',
  'login_methods',
]);

const AUTH_READ_ACTIONS = new Set(['bridge_plugin_version']);

const ADMIN_ACTIONS = new Set([
  'list_bridge_versions',
  'get_admin_workspace_inbox',
  'save_admin_workspace_inbox',
  'list_api_env',
  'save_api_env',
  'get',
  'list',
  'create',
  'update',
  'upsert',
  '',
]);

const ACTION_ALIASES = {
  listapienv: 'list_api_env',
  saveapienv: 'save_api_env',
};

function normalizeAction(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  return ACTION_ALIASES[s] || s;
}

export default async ({ req, res, log, error }) => {
  if (!hasAppwriteServerEnv(req)) {
    error('[platform-settings] Missing Appwrite server env.');
    return fail(res, 'Function environment is not configured.', 500);
  }

  let payload = {};
  try {
    payload = parsePayload(req);
  } catch (e) {
    error('[platform-settings] parse payload: ' + e.message);
    return fail(res, 'Invalid request body', 400);
  }
  req._parsedPayload = payload;

  const queryAction = req.query?.action || req.query?.Action;
  const actionRaw = normalizeAction(queryAction || payload.action || '');

  log(`[platform-settings] action=${actionRaw || '(none)'}`);

  let databases;
  let users;
  let teams;
  let client;
  try {
    ({ client, databases, users, teams } = await createServerClientAndDatabases({ req }));
  } catch (e) {
    error('[platform-settings] credentials: ' + e.message);
    return fail(res, 'Could not resolve Appwrite credentials.', 500);
  }

  const ctx = { req, res, log, error, client, databases, users, teams, payload };

  if (PUBLIC_ACTIONS.has(actionRaw)) {
    try {
      switch (actionRaw) {
        case 'public_auth_config':
          return await handlePublicAuthConfig(ctx);
        case 'public_branding':
          return await handlePublicBranding(ctx);
        case 'public_hub_layout':
          return await handlePublicHubLayout(ctx);
        case 'login_methods':
          return await handleLoginMethods(ctx);
        default:
          return fail(res, 'Unknown public action.', 400);
      }
    } catch (e) {
      error('[platform-settings] public unhandled: ' + e.message);
      return fail(res, e.message || 'Internal error', 500);
    }
  }

  const actorUserId = callerUserIdFromReq(req);
  if (!actorUserId) {
    return fail(res, 'Unauthorized: could not resolve caller user', 401);
  }

  if (AUTH_READ_ACTIONS.has(actionRaw)) {
    try {
      return await handleBridgePluginVersion({ ...ctx, actorUserId });
    } catch (e) {
      error('[platform-settings] bridge_plugin_version: ' + e.message);
      return fail(res, e.message || 'Internal error', 500);
    }
  }

  const needsAdmin = ADMIN_ACTIONS.has(actionRaw);

  if (!needsAdmin) {
    return fail(
      res,
      'Unknown action. Use bridge_plugin_version, get, list, list_api_env, save_api_env, list_bridge_versions, get_admin_workspace_inbox, save_admin_workspace_inbox, public_auth_config, public_branding, public_hub_layout, login_methods, or omit action for upsert.',
      400,
    );
  }

  try {
    const isAdmin = await userIsAdmin(users, teams, actorUserId, log);
    if (!isAdmin) {
      return fail(res, 'Forbidden: Admin access required', 403);
    }

    switch (actionRaw) {
      case 'list_bridge_versions':
        return await handleListBridgeVersions(ctx);
      case 'get_admin_workspace_inbox':
        return await handleGetAdminWorkspaceInbox(ctx);
      case 'save_admin_workspace_inbox':
        return await handleSaveAdminWorkspaceInbox(ctx);
      case 'list_api_env':
        return await handleListApiEnv({ ...ctx, actorUserId });
      case 'save_api_env':
        return await handleSaveApiEnv({ ...ctx, actorUserId });
      case 'get':
      case 'list':
        return await handleListSettings({ ...ctx, actorUserId });
      case 'create':
      case 'update':
      case 'upsert':
      case '':
        return await handleUpsertSetting({ ...ctx, actionRaw });
      default:
        return fail(
          res,
          'Unknown admin action. Use get, list, list_api_env, save_api_env, list_bridge_versions, get_admin_workspace_inbox, save_admin_workspace_inbox, create, update, upsert, or omit action for upsert.',
          400,
        );
    }
  } catch (e) {
    error('[platform-settings] admin unhandled: ' + e.message);
    return fail(res, e.message || 'Internal error', 500);
  }
};
