/**
 * wp-proxy — Hub → WordPress bridge REST (handler-based dispatch).
 */
import {
  hasAppwriteServerEnv,
  createServerClientAndDatabases,
  parsePayload,
  fail,
} from '@code045/wphubpro-shared';
import { formatErrorForLog, snapshotIncomingRequest, stringifyRedactedPayload } from './lib/logRedact.ts';
import type {
  WpProxyAppwriteReq,
  WpProxyAppwriteRes,
  WpProxyHandler,
  WpProxyHandlerKey,
  WpProxyPayload,
} from './lib/types.ts';

import handlePluginsUpdate from './handlers/plugins/update.ts';
import handlePluginsInstall from './handlers/plugins/install.ts';
import handlePluginsActivate from './handlers/plugins/activate.ts';
import handlePluginsDeactivate from './handlers/plugins/deactivate.ts';
import handlePluginsUninstall from './handlers/plugins/uninstall.ts';
import handleThemesUpdate from './handlers/themes/update.ts';
import handleThemesInstall from './handlers/themes/install.ts';
import handleThemesActivate from './handlers/themes/activate.ts';
import handleThemesDeactivate from './handlers/themes/deactivate.ts';
import handleThemesUninstall from './handlers/themes/uninstall.ts';
import handleBridgeForceUpdate from './handlers/bridge/forceUpdate.ts';

const HANDLERS: Record<WpProxyHandlerKey, WpProxyHandler> = {
  'plugins/update': handlePluginsUpdate,
  'plugins/install': handlePluginsInstall,
  'plugins/activate': handlePluginsActivate,
  'plugins/deactivate': handlePluginsDeactivate,
  'plugins/uninstall': handlePluginsUninstall,
  'plugins/de-install': handlePluginsUninstall,
  'themes/update': handleThemesUpdate,
  'themes/install': handleThemesInstall,
  'themes/activate': handleThemesActivate,
  'themes/deactivate': handleThemesDeactivate,
  'themes/uninstall': handleThemesUninstall,
  'bridge/forceUpdate': handleBridgeForceUpdate,
};

function normalizeHandler(handlerRaw: unknown): WpProxyHandlerKey | '' {
  const s = String(handlerRaw || '').trim().toLowerCase();
  if (!s) return '';
  if (s === 'bridge_force_update' || s === 'bridge/forceupdate' || s === 'bridge/force-update') {
    return 'bridge/forceUpdate';
  }

  if (s.includes('/')) {
    if (s === 'plugins/de-install' || s === 'plugins/deinstall' || s === 'plugins/de_install') {
      return 'plugins/uninstall';
    }
    if (s in HANDLERS) return s as WpProxyHandlerKey;
    return '';
  }

  let t = s.replace(/-/g, '/');
  if (t.includes('/')) {
    if (t in HANDLERS) return t as WpProxyHandlerKey;
    return '';
  }

  const m = t.match(/^(plugins|themes|bridge)_(.+)$/);
  if (!m) return '';
  const pref = m[1];
  const rest = m[2];
  if (pref === 'plugins' && (rest === 'de_install' || rest === 'deinstall')) return 'plugins/uninstall';
  if (pref === 'themes' && rest === 'uninstall') return 'themes/uninstall';
  if (pref === 'bridge' && rest === 'force_update') return 'bridge/forceUpdate';
  const key = `${pref}/${rest.replace(/_/g, '/')}` as WpProxyHandlerKey;
  return key in HANDLERS ? key : '';
}

export default async ({
  req,
  res,
  log,
  error,
}: {
  req: WpProxyAppwriteReq;
  res: WpProxyAppwriteRes;
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}) => {
  const logFn = typeof log === 'function' ? log : (...args: unknown[]) => console.log(...args);
  const logError = typeof error === 'function' ? error : (...args: unknown[]) => console.error(...args);

  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  const fetchImpl = globalThis.fetch;

  if (!hasAppwriteServerEnv(req)) {
    logError('[wp-proxy] Missing Appwrite server env (endpoint, project, API key).');
    try {
      logError(
        `[wp-proxy] request snapshot (env check failed):\n${stringifyRedactedPayload(snapshotIncomingRequest(req, {}))}`,
      );
    } catch (e) {
      logError(`[wp-proxy] request snapshot log failed: ${formatErrorForLog(e)}`);
    }
    return fail(res, 'Function environment is not configured.', 500);
  }

  let payload: WpProxyPayload = {};
  try {
    payload = (parsePayload(req) as WpProxyPayload) || {};
  } catch (e) {
    logError(`[wp-proxy] parsePayload threw: ${formatErrorForLog(e)}`);
    try {
      logError(
        `[wp-proxy] request at parse failure:\n${stringifyRedactedPayload(snapshotIncomingRequest(req, {}))}`,
      );
    } catch (logErr) {
      logError(`[wp-proxy] could not snapshot request: ${formatErrorForLog(logErr)}`);
    }
    return fail(res, 'Invalid JSON body.', 400);
  }
  req._parsedPayload = payload;

  const normalized = normalizeHandler(payload.handler);
  const siteId = String(payload.siteId || payload.site_id || '').trim();

  if (!normalized) {
    logError(
      `[wp-proxy] missing handler: payload keys=${Object.keys(payload).join(', ')} siteId=${siteId}`,
    );
    return fail(res, 'Missing handler.', 400);
  }

  logFn(`[wp-proxy] handler=${normalized} siteId=${siteId}`);

  let databases;
  let users;
  let teams;
  let endpoint;
  let projectId;
  let apiKey;

  try {
    ({ databases, users, teams, endpoint, projectId, apiKey } = await createServerClientAndDatabases({ req }));
  } catch (e) {
    logError(`[wp-proxy] credentials: ${formatErrorForLog(e)}`);
    return fail(res, 'Could not resolve Appwrite credentials.', 500);
  }

  const fn = HANDLERS[normalized];
  if (typeof fn !== 'function') {
    logError(`[wp-proxy] invalid handler module for ${normalized}`);
    return fail(res, 'Internal handler error.', 500);
  }

  const ctx = {
    req,
    res,
    log: logFn,
    error: logError,
    databases,
    users,
    teams,
    endpoint,
    projectId,
    apiKey,
    ENCRYPTION_KEY,
    fetch: fetchImpl,
    payload,
  };

  try {
    return await fn(ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logError(`[wp-proxy] handler ${normalized}: ${formatErrorForLog(e)}`);
    return fail(res, msg || 'Internal error', 500);
  }
};
