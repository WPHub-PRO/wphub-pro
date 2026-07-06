// Version: 1.3.0
/**
 * sites — unified site API (create/update/connect, meta, health, PageSpeed, health-AI delegation).
 */
import {
  hasAppwriteServerEnv,
  createServerClientAndDatabases,
  parsePayload,
  fail,
  ok,
  readEnv,
} from '@code045/wphubpro-shared';

import handleCreateSite from './handlers/createSite.ts';
import handleUpdateSite from './handlers/updateSite.ts';
import handleConnectSite from './handlers/connectSite.ts';
import handleFetchSiteMeta from './handlers/fetchSiteMeta.ts';
import handleSyncSiteMeta from './handlers/syncSiteMeta.ts';
import handlePushSiteHealth from './handlers/pushSiteHealth.ts';
import handleAppendSiteActionLog from './handlers/appendSiteActionLog.ts';
import handleCheckSiteHealth from './handlers/checkSiteHealth.ts';
import handleRunPagespeed from './handlers/runPagespeed.ts';
import handleHealthAi from './handlers/healthAi.ts';
import { normalizeSitesAction } from './lib/types.ts';
import type { SitesAppwriteReq, SitesAppwriteRes, SitesCtxBase, SitesLogFn } from './lib/types.ts';

export default async ({
  req,
  res,
  log,
  error,
}: {
  req: SitesAppwriteReq;
  res: SitesAppwriteRes;
  log?: SitesLogFn;
  error?: SitesLogFn;
}) => {
  const logInfo = typeof log === 'function' ? log : (...args: unknown[]) => console.log(...args);
  const logError = typeof error === 'function' ? error : (...args: unknown[]) => console.error(...args);

  const ENCRYPTION_KEY = readEnv('ENCRYPTION_KEY') || '';

  if (!hasAppwriteServerEnv(req)) {
    logError('[sites] Missing Appwrite server env (endpoint, project, API key).');
    return fail(res, 'Function environment is not configured.', 500);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = parsePayload(req) as Record<string, unknown>;
  } catch {
    return fail(res, 'Invalid JSON body.', 400);
  }
  req._parsedPayload = payload;

  const queryAction = req.query?.action || req.query?.Action;
  const action = normalizeSitesAction(queryAction || payload.action || '');

  logInfo(`[sites] action=${action}`);

  let databases;
  let users;
  let teams;
  let client;
  try {
    ({ client, databases, users, teams } = await createServerClientAndDatabases({
      req,
      includeCredentialsInReturn: false,
    }));
  } catch (e) {
    logError(`[sites] credentials: ${(e as Error).message}`);
    return fail(res, 'Could not resolve Appwrite credentials.', 500);
  }

  const ctxBase: SitesCtxBase = {
    req,
    res,
    log: logInfo,
    error: logError,
    client,
    databases,
    users,
    teams,
    ENCRYPTION_KEY,
    fetch: globalThis.fetch,
  };

  try {
    switch (action) {
      case 'create_site':
        return await handleCreateSite(ctxBase);
      case 'update_site':
        return await handleUpdateSite(ctxBase);
      case 'connect_site':
        return await handleConnectSite(ctxBase);
      case 'fetch_site_meta':
        return await handleFetchSiteMeta(ctxBase);
      case 'sync_site_meta':
        return await handleSyncSiteMeta(ctxBase);
      case 'push_site_health':
        return await handlePushSiteHealth(ctxBase);
      case 'append_site_action_log':
        return await handleAppendSiteActionLog(ctxBase);
      case 'check_site_health':
        return await handleCheckSiteHealth(ctxBase);
      case 'run_pagespeed':
        return await handleRunPagespeed(ctxBase);
      case 'get_health_ai_suggestions':
      case 'execute_health_ai_step':
      case 'dry_run_health_ai':
        return await handleHealthAi({ ...ctxBase, subAction: action });
      case '':
        return ok(res, {
          success: true,
          message: 'Sites function online.',
          actions: [
            'create_site',
            'update_site',
            'connect_site',
            'fetch_site_meta',
            'sync_site_meta',
            'push_site_health',
            'append_site_action_log',
            'check_site_health',
            'run_pagespeed',
            'get_health_ai_suggestions',
            'execute_health_ai_step',
            'dry_run_health_ai',
          ],
        });
      default:
        return fail(
          res,
          'Invalid or missing action. Expected: create_site, update_site, connect_site, fetch_site_meta, sync_site_meta, push_site_health, append_site_action_log, check_site_health, run_pagespeed, get_health_ai_suggestions, execute_health_ai_step, dry_run_health_ai.',
          400,
        );
    }
  } catch (e) {
    logError(`[sites] unhandled: ${(e as Error).message}`);
    return fail(res, (e as Error).message || 'Internal error', 500);
  }
};
