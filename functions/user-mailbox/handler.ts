// Version: 1.0.0
/**
 * user-mailbox — workspace-scoped IMAP read + SMTP send.
 * Credentials: `platform_db.accounts` (personal) and `platform_db.teams` (shared team mailbox).
 * Secrets: AES-256-GCM envelope (WPHUB_MAIL_SECRETS_KEY or ENCRYPTION_KEY).
 */
import {
  hasAppwriteServerEnv,
  createServerClients,
  parsePayload,
  fail,
  callerUserIdFromReq,
} from '@code045/wphubpro-shared';
import { handleMailbox } from './handlers/mailboxHandler.ts';

function normalizeMailboxAction(a: unknown): string {
  return String(a ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

/**
 * Appwrite sometimes delivers createExecution JSON as `{ action, body: "<stringified object>" }`
 * (or `body` as a nested object). `parsePayload` in functions-lib returns that shell when
 * `action` is set at the top level, so inner fields like `folder` never reach the handler
 * and `list_messages` / `fetch_raw` / `message_action` fell back to INBOX only.
 */
function expandMailboxExecutionPayload(payload: Record<string, unknown> | null | undefined) {
  if (!payload || typeof payload !== 'object') return payload;
  let inner: Record<string, unknown> | null = null;
  if (typeof payload.body === 'string') {
    const t = payload.body.trim();
    if (!t.startsWith('{')) return payload;
    try {
      const o = JSON.parse(t);
      if (o && typeof o === 'object' && !Array.isArray(o)) inner = o as Record<string, unknown>;
    } catch {
      return payload;
    }
  } else if (payload.body && typeof payload.body === 'object' && !Array.isArray(payload.body)) {
    inner = payload.body as Record<string, unknown>;
  } else {
    return payload;
  }
  const innerAction = normalizeMailboxAction(inner.action);
  const outerAction = normalizeMailboxAction(payload.action);
  if (innerAction && outerAction && innerAction !== outerAction) return payload;
  const { body: _omitBody, ...shell } = payload;
  return { ...inner, ...shell };
}

export default async ({
  req,
  res,
  log,
  error,
}: {
  req: Record<string, unknown> & { _parsedPayload?: Record<string, unknown> };
  res: unknown;
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}) => {
  const logInfo = typeof log === 'function' ? log : (...args: unknown[]) => console.log(...args);
  const logError = typeof error === 'function' ? error : (...args: unknown[]) => console.error(...args);

  if (!hasAppwriteServerEnv(req)) {
    logError('[user-mailbox] Missing Appwrite server env.');
    return fail(res, 'Function environment is not configured.', 500);
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (expandMailboxExecutionPayload(parsePayload(req) as Record<string, unknown>) ||
      {}) as Record<string, unknown>;
  } catch (e) {
    logError(
      `[user-mailbox] Invalid JSON / payload parse: ${e instanceof Error ? e.message : String(e)}`,
    );
    return fail(res, 'Invalid JSON body.', 400);
  }
  req._parsedPayload = payload;

  const actor = callerUserIdFromReq(req);
  if (!actor) {
    return fail(res, 'Unauthorized: could not resolve caller user', 401);
  }

  let databases;
  let users;
  let teams;
  try {
    ({ databases, users, teams } = await createServerClients({ req }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logError(`[user-mailbox] credentials: ${msg}`);
    return fail(res, 'Could not resolve Appwrite credentials.', 500);
  }

  return handleMailbox({
    req,
    res,
    log: logInfo,
    databases,
    users,
    teams,
    payload,
    actor,
  });
};
