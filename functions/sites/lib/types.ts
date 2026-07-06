/**
 * sites — action dispatch types.
 */
import type { Client, Databases, Teams, Users } from '@code045/wphubpro-shared';

export type SitesAppwriteReq = Record<string, unknown> & {
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  _parsedPayload?: SitesPayload;
};

export type SitesAppwriteRes = {
  json: (body: unknown, status?: number) => unknown;
};

export type SitesLogFn = (...args: unknown[]) => void;

export type SitesPayload = Record<string, unknown>;

export type SitesAction =
  | 'create_site'
  | 'update_site'
  | 'connect_site'
  | 'fetch_site_meta'
  | 'sync_site_meta'
  | 'push_site_health'
  | 'append_site_action_log'
  | 'check_site_health'
  | 'run_pagespeed'
  | 'get_health_ai_suggestions'
  | 'execute_health_ai_step'
  | 'dry_run_health_ai'
  | '';

export type SitesCtxBase = {
  req: SitesAppwriteReq;
  res: SitesAppwriteRes;
  log: SitesLogFn;
  error: SitesLogFn;
  client: Client;
  databases: Databases;
  users: Users;
  teams: Teams;
  ENCRYPTION_KEY: string;
  fetch: typeof globalThis.fetch;
};

export type SitesHealthAiCtx = SitesCtxBase & {
  subAction: string;
};

export function normalizeSitesAction(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}
