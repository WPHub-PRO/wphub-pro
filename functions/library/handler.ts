// Version: 1.0.0
/**
 * library — `add_local_item`: parse WordPress plugin/theme ZIP, upload to Appwrite Storage, upsert platform_db.library.
 */
import {
  hasAppwriteServerEnv,
  createServerClients,
  parsePayload,
  fail,
  callerUserIdFromReq,
} from '@code045/wphubpro-shared';
import { handleAddLocalItem } from './handlers/addLocalItem.ts';

function normalizeAction(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

const ALIASES: Record<string, string> = {
  addlocalitem: 'add_local_item',
  add_local: 'add_local_item',
};

type AppwriteReq = Record<string, unknown> & {
  _parsedPayload?: Record<string, unknown>;
  query?: Record<string, unknown>;
};

export default async ({
  req,
  res,
  log,
  error,
}: {
  req: AppwriteReq;
  res: { json: (body: unknown, status?: number) => unknown };
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}) => {
  const logFn = typeof log === 'function' ? log : (...args: unknown[]) => console.log(...args);
  const logError = typeof error === 'function' ? error : (...args: unknown[]) => console.error(...args);

  if (!hasAppwriteServerEnv(req)) {
    logError('[library] Missing Appwrite server env (endpoint, project, API key).');
    return fail(res, 'Function environment is not configured.', 500);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (parsePayload(req) as Record<string, unknown>) || {};
  } catch {
    return fail(res, 'Invalid JSON body.', 400);
  }
  req._parsedPayload = payload;

  const queryAction = req.query?.action || req.query?.Action;
  const raw = normalizeAction(queryAction || payload.action || '');
  const action = ALIASES[raw] || raw;

  logFn(`[library] action=${action}`);

  const actorUserId = callerUserIdFromReq(req);

  let databases;
  let users;
  let teams;
  let storage;
  try {
    ({ databases, users, teams, storage } = await createServerClients({
      req,
      includeStorage: true,
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logError(`[library] credentials: ${msg}`);
    return fail(res, 'Could not resolve Appwrite credentials.', 500);
  }

  const ctx = {
    req,
    res,
    log: logFn,
    error: logError,
    databases,
    users,
    teams,
    storage,
    actorUserId,
  };

  try {
    switch (action) {
      case 'add_local_item':
        return await handleAddLocalItem(ctx);
      default:
        return fail(res, 'Invalid or missing action. Expected: add_local_item.', 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logError(`[library] unhandled: ${msg}`);
    return fail(res, msg || 'Internal error', 500);
  }
};
