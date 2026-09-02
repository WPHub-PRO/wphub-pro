/**
 * wp-proxy — handler dispatch + bridge REST types.
 */
import type { Databases, Teams, Users } from '@code045/wphubpro-shared';

export type WpProxyAppwriteReq = {
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  _parsedPayload?: WpProxyPayload;
};

export type WpProxyAppwriteRes = {
  json: (body: unknown, status?: number) => unknown;
};

export type WpProxyLogFn = (...args: unknown[]) => void;

export type WpProxyPayload = {
  handler?: string;
  siteId?: string;
  site_id?: string;
  body?: Record<string, unknown>;
  jwt?: string;
  [key: string]: unknown;
};

export type WpProxyHandlerKey =
  | 'plugins/update'
  | 'plugins/install'
  | 'plugins/activate'
  | 'plugins/deactivate'
  | 'plugins/uninstall'
  | 'themes/update'
  | 'themes/install'
  | 'themes/activate'
  | 'themes/deactivate'
  | 'themes/delete'
  | 'bridge/forceUpdate'
  | 'sync';

export type WpProxyCtx = {
  req: WpProxyAppwriteReq;
  res: WpProxyAppwriteRes;
  log: WpProxyLogFn;
  error: WpProxyLogFn;
  databases: Databases;
  users: Users;
  teams: Teams;
  endpoint: string;
  projectId: string;
  apiKey: string;
  ENCRYPTION_KEY: string | undefined;
  fetch: typeof globalThis.fetch;
  payload: WpProxyPayload;
};

export type WpProxyHandlerResult = unknown;
export type WpProxyHandler = (ctx: WpProxyCtx) => Promise<WpProxyHandlerResult>;

export type BridgeRestOptions = {
  siteId: string;
  bridgePath: string;
  method?: string;
  body?: Record<string, unknown>;
  wpAction?: string;
  wpPlugin?: string;
  blind?: boolean;
};

export type BridgeRestResult =
  | { ok: true; statusCode: number; message: string; responseData?: unknown }
  | { ok: false; statusCode: number; message: string; details?: Record<string, unknown> };

export type BridgeCallCtx = Pick<
  WpProxyCtx,
  'databases' | 'fetch' | 'log' | 'error' | 'ENCRYPTION_KEY'
>;

export type LoadSiteForBridgeResult =
  | {
      ok: true;
      siteDocument: Record<string, unknown>;
      bridgeSecret: string;
      dbId: string;
      sitesColl: string;
    }
  | { ok: false; statusCode: number; message: string };

export type PluginInstallBulkRow = {
  slug?: string;
  wpSlug?: string;
  wp_slug?: string;
  version?: string;
  plugin?: string;
  zip_url?: string;
  zipUrl?: string;
  source?: string;
  library_item_id?: string;
  libraryItemId?: string;
  routeSlug?: string;
  route_slug?: string;
  [key: string]: unknown;
};

export type ThemeInstallBulkRow = {
  slug?: string;
  wpSlug?: string;
  wp_slug?: string;
  stylesheet?: string;
  version?: string;
  zip_url?: string;
  zipUrl?: string;
  source?: string;
  library_item_id?: string;
  libraryItemId?: string;
  routeSlug?: string;
  route_slug?: string;
  [key: string]: unknown;
};

export type PluginInstallBulkNormOk = { ok: true; body: { plugins: PluginInstallBulkRow[] } };
export type ThemeInstallBulkNormOk = { ok: true; body: { themes: ThemeInstallBulkRow[] } };
export type PluginInstallBulkNormResult = PluginInstallBulkNormOk | BulkNormFail;
export type ThemeInstallBulkNormResult = ThemeInstallBulkNormOk | BulkNormFail;

export type PluginBulkRow = {
  plugin: string;
  slug: string;
  version: string;
  zip_url?: string;
  zipUrl?: string;
  source?: string;
  library_item_id?: string;
  libraryItemId?: string;
  [key: string]: unknown;
};

export type ThemeBulkRow = {
  stylesheet: string;
  slug: string;
  version: string;
  zip_url?: string;
  zipUrl?: string;
  source?: string;
  library_item_id?: string;
  libraryItemId?: string;
  routeSlug?: string;
  route_slug?: string;
  [key: string]: unknown;
};

export type PluginBulkNormOk = { ok: true; body: { plugins: PluginBulkRow[] } };
export type ThemeBulkNormOk = { ok: true; body: { themes: ThemeBulkRow[] } };
export type BulkNormFail = { ok: false; message: string };

export type PluginBulkNormResult = PluginBulkNormOk | BulkNormFail;
export type ThemeBulkNormResult = ThemeBulkNormOk | BulkNormFail;

export type BulkOperationResult = {
  id: string;
  ok: boolean;
  installed?: boolean;
  activated?: boolean;
  error?: string;
};
export type BulkResponseShape = {
  results: BulkOperationResult[];
  succeeded: number;
  failed: number;
};

export type ZipSource = 'official' | 'local' | 'remote';
export type PluginZipResolveOk = { ok: true; zipUrl: string; source?: ZipSource };
export type ResourceResolveFail = { ok: false; statusCode: number; message: string };

export type PluginZipResolveResult = PluginZipResolveOk | ResourceResolveFail;
export type PluginInstallVersionOk = { ok: true; slug: string; version: string };
export type PluginInstallVersionResult = PluginInstallVersionOk | ResourceResolveFail;
export type ThemeLibraryZipOk = { ok: true; zipUrl: string; source?: ZipSource };
export type ThemeLibraryZipResult = ThemeLibraryZipOk | ResourceResolveFail;
export type ThemeZipResolveResult = ThemeLibraryZipResult;

export type ResolveThemeUpdateZipUrlArgs = {
  databases: Databases;
  fetchImpl?: typeof globalThis.fetch;
  log: WpProxyLogFn;
  body: Record<string, unknown>;
};

export type ResolvePluginUpdateZipUrlArgs = {
  databases: Databases;
  fetchImpl: typeof globalThis.fetch;
  log: WpProxyLogFn;
  body: Record<string, unknown>;
};

export type ResolvePluginLibraryInstallVersionArgs = {
  databases: Databases;
  libraryItemId: string;
  routeSlug: string;
  log: WpProxyLogFn;
};

export type ResolveThemeLibraryZipArgs = {
  databases: Databases;
  log: WpProxyLogFn;
  libraryItemId: string;
  routeSlug: string;
  version: string;
};
