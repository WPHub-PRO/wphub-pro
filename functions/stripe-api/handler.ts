/**
 * stripe-api — Hub billing (path + method dispatch, wp-proxy orchestration pattern).
 */
import {
  hasAppwriteServerEnv,
  createServerClientAndDatabases,
  parsePayload,
  fail,
} from '@code045/wphubpro-shared';
import { formatErrorForLog, snapshotIncomingRequest, stringifyRedactedPayload } from './lib/logRedact.ts';
import { normalizePath, splitPathAndQuery } from './lib/pathUtils.ts';
import { matchRoute, routeNeedsStripeSecret } from './lib/routes.ts';
import { resolveExecutorUserId } from './lib/resolveExecutorUser.ts';
import { errorMessage, statusFromError } from './lib/handlerUtils.ts';
import type { HttpMethod, StripeApiCtx, StripeApiPayload } from './lib/types.ts';

function resolveHttpMethod(raw: unknown, req: { method?: string } | undefined): HttpMethod {
  const m = String(
    (typeof raw === 'string' && raw) || (req && typeof req.method === 'string' && req.method) || 'GET',
  ).toUpperCase();
  if (m === 'GET' || m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') return m;
  return 'GET';
}

function hasStripeSecret(): boolean {
  return Boolean(String(process.env.STRIPE_SECRET_KEY || '').trim());
}

function hasPublishableKey(): boolean {
  return Boolean(String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim());
}

function hasWebhookSecret(): boolean {
  return Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || '').trim());
}

export default async ({
  req,
  res,
  log,
  error,
}: {
  req: StripeApiCtx['req'];
  res: StripeApiCtx['res'];
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}) => {
  const logFn = typeof log === 'function' ? log : (...args: unknown[]) => console.log(...args);
  const logError = typeof error === 'function' ? error : (...args: unknown[]) => console.error(...args);

  let payload: StripeApiPayload = {};
  try {
    payload = (parsePayload(req) as StripeApiPayload) || {};
  } catch (e) {
    logError(`[stripe-api] parsePayload threw: ${formatErrorForLog(e)}`);
    return fail(res, 'Invalid JSON payload', 400);
  }
  req._parsedPayload = payload;

  const rawPath =
    (typeof payload.path === 'string' && payload.path) ||
    (typeof payload.stripePath === 'string' && payload.stripePath) ||
    (req && typeof req.path === 'string' && req.path.trim()) ||
    '';
  const method = resolveHttpMethod(payload.method, req);
  const { pathname: p0, searchParams } = splitPathAndQuery(rawPath);
  const path = normalizePath(p0);
  const body =
    payload.body && typeof payload.body === 'object' && !Array.isArray(payload.body)
      ? (payload.body as Record<string, unknown>)
      : {};

  const matched = matchRoute(method, path);
  if (!matched) {
    logError(`[stripe-api] no route: ${method} ${path || '(empty path)'}`);
    return fail(res, `Stripe route not implemented in stripe-api: ${method} ${path || '(empty path)'}`, 501);
  }

  const { def, params: routeParams } = matched;
  logFn(`[stripe-api] route=${method} ${path}`);

  if (def.needsPublishableKey && !hasPublishableKey()) {
    logError('[stripe-api] STRIPE_PUBLISHABLE_KEY is not configured');
    return fail(res, 'STRIPE_PUBLISHABLE_KEY is not configured on this function', 500);
  }

  if (def.needsWebhookSecret && !hasWebhookSecret()) {
    logError('[stripe-api] STRIPE_WEBHOOK_SECRET is not configured');
    return fail(res, 'STRIPE_WEBHOOK_SECRET is not configured', 503);
  }

  if (routeNeedsStripeSecret(def) && !hasStripeSecret()) {
    logError('[stripe-api] STRIPE_SECRET_KEY is not configured');
    return fail(res, 'STRIPE_SECRET_KEY is not configured on this function', 500);
  }

  let databases;
  let users;
  let teams;
  let endpoint;
  let projectId;
  let apiKey;

  if (def.needsAppwrite) {
    if (!hasAppwriteServerEnv(req)) {
      logError('[stripe-api] Missing Appwrite server env (endpoint, project, API key).');
      try {
        logError(
          `[stripe-api] request snapshot (env check failed):\n${stringifyRedactedPayload(snapshotIncomingRequest(req, payload))}`,
        );
      } catch (e) {
        logError(`[stripe-api] request snapshot log failed: ${formatErrorForLog(e)}`);
      }
      return fail(res, 'Function environment is not configured.', 500);
    }
    try {
      ({ databases, users, teams, endpoint, projectId, apiKey } = await createServerClientAndDatabases({ req }));
    } catch (e) {
      logError(`[stripe-api] credentials: ${formatErrorForLog(e)}`);
      return fail(res, 'Could not resolve Appwrite credentials.', 500);
    }
  }

  let executorUserId: string | undefined;
  if (def.needsAuth) {
    executorUserId = (await resolveExecutorUserId(req)) || undefined;
    if (!executorUserId) {
      return fail(res, 'Unauthorized — no executor user id', 401);
    }
  }

  const ctx: StripeApiCtx = {
    req,
    res,
    log: logFn,
    error: logError,
    path,
    method,
    searchParams,
    body,
    payload,
    routeParams,
    databases,
    users,
    teams,
    endpoint,
    projectId,
    apiKey,
    executorUserId,
  };

  try {
    return await def.handler(ctx);
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e && (e as { code: unknown }).code === 'NOT_IMPLEMENTED') {
      return fail(res, errorMessage(e), 501);
    }
    const sc = statusFromError(e) ?? 500;
    logError(`[stripe-api] handler ${method} ${path}: ${formatErrorForLog(e)}`);
    return fail(res, errorMessage(e), sc);
  }
};
