// Version: 1.2.8
/**
 * users — user actions for admins.
 */
import {
  hasAppwriteServerEnv as hasAppwriteBootstrap,
  createServerClientAndDatabases,
  parsePayload,
  callerUserIdFromReq,
  userIsAdmin,
  Users,
  Teams,
} from '@code045/wphubpro-shared';

import { buildCtx } from './lib/buildCtx.ts';
import { ADMIN_ACTIONS, HANDLERS, TEAM_ACTIONS, normalizeAction } from './lib/actionRegistry.ts';
import type { UsersAppwriteReq, UsersAppwriteRes, UsersCtx, UsersHandlerArgs, UsersLogFn } from './lib/types.ts';

async function assertAdmin(
  req: UsersAppwriteReq,
  res: UsersAppwriteRes,
  ctx: UsersCtx,
  log: UsersLogFn,
): Promise<boolean> {
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    res.json({ success: false, message: 'Unauthorized: could not resolve caller user' }, 401);
    return false;
  }
  const ok = await userIsAdmin(ctx.users, ctx.teams, actor, log);
  if (!ok) {
    log(`users: forbidden for non-admin actor ${actor}`);
    res.json({ success: false, message: 'Forbidden: Admin access required' }, 403);
    return false;
  }
  return true;
}

export default async ({
  req,
  res,
  log,
  error,
}: {
  req: UsersAppwriteReq;
  res: UsersAppwriteRes;
  log?: UsersLogFn;
  error?: UsersLogFn;
}) => {
  const logFn = typeof log === 'function' ? log : (...args: unknown[]) => console.log(...args);
  const errorFn = typeof error === 'function' ? error : (...args: unknown[]) => console.error(...args);

  try {
    if (!hasAppwriteBootstrap(req)) {
      errorFn('Appwrite configuration missing');
      return res.json({ success: false, message: 'Appwrite config missing' }, 500);
    }

    let client;
    let databases;
    let users;
    let teams;
    let endpoint;
    let projectId;
    let apiKey;
    try {
      ({ client, databases, users, teams, endpoint, projectId, apiKey } = await createServerClientAndDatabases({
        req,
      }));
    } catch (e) {
      errorFn((e as Error).message);
      return res.json({ success: false, message: 'Appwrite credentials unavailable' }, 500);
    }

    if (client) {
      if (!users) users = new Users(client);
      if (!teams) teams = new Teams(client);
    }

    const payload = parsePayload(req);
    req._parsedPayload = payload as Record<string, unknown>;

    const action = normalizeAction(req.query?.action || (payload as Record<string, unknown>).action || '');
    logFn('users action=' + action);

    const ctx = buildCtx({ client, databases, users, teams, endpoint, projectId, apiKey });
    const args: UsersHandlerArgs = { req, res, log: logFn, error: errorFn };

    if (action === 'team-invite-preview' || action === 'team-invite-decline') {
      const handler = HANDLERS[action];
      return handler ? await handler(args, ctx) : undefined;
    }

    if (TEAM_ACTIONS.has(action)) {
      const handler = HANDLERS[action];
      return handler ? await handler(args, ctx) : undefined;
    }

    if (action === 'team-invite-claim') {
      return await HANDLERS['team-invite-claim'](args, ctx);
    }

    if (action === 'ensure-account') {
      return await HANDLERS['ensure-account'](args, ctx);
    }

    if (ADMIN_ACTIONS.has(action)) {
      const allowed = await assertAdmin(req, res, ctx, logFn);
      if (!allowed) return undefined;
      const handler = HANDLERS[action];
      return handler ? await handler(args, ctx) : undefined;
    }

    if (action === 'set-active-team') {
      return await HANDLERS['set-active-team'](args, ctx);
    }

    return res.json(
      {
        success: false,
        message:
          'Invalid or missing action. Use action: "ensure-account", "team-create", "team-invite", "team-invites-list", "team-invite-resend", "team-invite-revoke", "team-invite-preview", "team-invite-decline", "team-invite-claim", "team-remove-member", "team-leave", "team-handover", "team-delete", "team-get", "teams-list", "set-active-team", "admin-teams-list", "admin-team-get", "admin-team-patch", "list", "get", "update", "delete", or "login-as".',
      },
      400,
    );
  } catch (err) {
    errorFn(`users failed: ${(err as Error).message}`);
    return res.json({ success: false, message: (err as Error).message || 'Internal error' }, 500);
  }
};
