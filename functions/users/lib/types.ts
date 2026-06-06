/**
 * users — action dispatch types.
 */
import type { Client, Databases, Teams, Users } from '@code045/wphubpro-shared';

export type UsersAppwriteReq = Record<string, unknown> & {
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  _parsedPayload?: Record<string, unknown>;
};

export type UsersAppwriteRes = {
  json: (body: unknown, status?: number) => unknown;
};

export type UsersLogFn = (...args: unknown[]) => void;

export type UsersHandlerArgs = {
  req: UsersAppwriteReq;
  res: UsersAppwriteRes;
  log: UsersLogFn;
  error: UsersLogFn;
};

export type UsersCtx = {
  client: Client;
  databases: Databases;
  users: Users;
  teams: Teams;
  stripe: null;
  APPWRITE_ENDPOINT: string;
  APPWRITE_PROJECT_ID: string;
  APPWRITE_API_KEY: string;
};

export type UsersHandlerFn = (args: UsersHandlerArgs, ctx: UsersCtx) => Promise<unknown>;

export type UsersAction =
  | 'list'
  | 'get'
  | 'update'
  | 'delete'
  | 'login-as'
  | 'ensure-account'
  | 'team-create'
  | 'team-invite'
  | 'team-invite-preview'
  | 'team-invite-decline'
  | 'team-invite-claim'
  | 'team-invites-list'
  | 'team-invite-resend'
  | 'team-invite-revoke'
  | 'team-remove-member'
  | 'team-leave'
  | 'team-handover'
  | 'team-delete'
  | 'team-get'
  | 'teams-list'
  | 'set-active-team'
  | 'admin-teams-list'
  | 'admin-team-get'
  | 'admin-team-patch'
  | '';

export type UsersHandlerKey = Exclude<UsersAction, ''>;
