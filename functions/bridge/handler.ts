// Version: 1.0.0
/**
 * bridge — `get_download_url` resolves the active bridge zip. `latest_version` promotes or returns read-only semver.
 */
import {
  hasAppwriteServerEnv,
  createServerClientAndDatabases,
  parsePayload,
  fail,
} from '@code045/wphubpro-shared';

import handleGetDownloadUrl from './handlers/getDownloadUrl.ts';
import handleLatestVersion from './handlers/latestVersion.ts';
import type { BridgeAction, BridgeAppwriteReq, BridgeAppwriteRes, BridgeLogFn } from './lib/types.ts';
import { resolveBridgeAction } from './lib/types.ts';

export default async ({
  req,
  res,
  log,
  error,
}: {
  req: BridgeAppwriteReq;
  res: BridgeAppwriteRes;
  log?: BridgeLogFn;
  error?: BridgeLogFn;
}) => {
  const logFn = typeof log === 'function' ? log : (...args: unknown[]) => console.log(...args);
  const errorFn = typeof error === 'function' ? error : (...args: unknown[]) => console.error(...args);

  if (!hasAppwriteServerEnv(req)) {
    errorFn('[bridge] Missing Appwrite server env (endpoint, project, API key).');
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
  const action = resolveBridgeAction(queryAction || payload.action || '');

  logFn(`[bridge] action=${action}`);

  let storage;
  let databases;
  let endpoint;
  let projectId;
  try {
    ({ storage, databases, endpoint, projectId } = await createServerClientAndDatabases({
      req,
      includeStorage: true,
    }));
  } catch (e) {
    errorFn(`[bridge] credentials: ${(e as Error).message}`);
    return fail(res, 'Could not resolve Appwrite credentials.', 500);
  }

  const ctx = {
    req,
    res,
    log: logFn,
    error: errorFn,
    storage,
    databases,
    endpoint,
    projectId,
  };

  try {
    switch (action) {
      case 'get_download_url':
        return await handleGetDownloadUrl(ctx);
      case 'latest_version':
        return await handleLatestVersion(ctx);
      default:
        return fail(
          res,
          'Invalid or missing action. Expected: get_download_url, latest_version.',
          400,
        );
    }
  } catch (e) {
    errorFn(`[bridge] unhandled: ${(e as Error).message}`);
    return fail(res, (e as Error).message || 'Internal error', 500);
  }
};
