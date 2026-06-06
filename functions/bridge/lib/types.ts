/**
 * bridge — action dispatch types.
 */
import type { Databases, Storage } from '@code045/wphubpro-shared';

export type BridgeAppwriteReq = Record<string, unknown> & {
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  _parsedPayload?: BridgePayload;
};

export type BridgeAppwriteRes = {
  json: (body: unknown, status?: number) => unknown;
};

export type BridgeLogFn = (...args: unknown[]) => void;

export type BridgePayload = {
  action?: string;
  file_id?: string;
  version?: string;
  [key: string]: unknown;
};

export type BridgeAction = 'get_download_url' | 'latest_version';

export type BridgeCtx = {
  req: BridgeAppwriteReq;
  res: BridgeAppwriteRes;
  log: BridgeLogFn;
  error: BridgeLogFn;
  storage: Storage;
  databases: Databases;
  endpoint: string;
  projectId: string;
};

export const BRIDGE_ACTION_ALIASES: Record<string, BridgeAction> = {
  getdownloadurl: 'get_download_url',
  downloadurl: 'get_download_url',
  download_url: 'get_download_url',
  latestversion: 'latest_version',
  version: 'latest_version',
};

export function normalizeBridgeAction(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
}

export function resolveBridgeAction(raw: unknown): BridgeAction | '' {
  const normalized = normalizeBridgeAction(raw);
  const aliased = BRIDGE_ACTION_ALIASES[normalized];
  if (aliased) return aliased;
  if (normalized === 'get_download_url' || normalized === 'latest_version') {
    return normalized as BridgeAction;
  }
  return '';
}
