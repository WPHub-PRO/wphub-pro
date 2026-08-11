import { useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Query } from 'appwrite';
import {
  account,
  APPWRITE_FUNCTION_IDS,
  COLLECTIONS,
  databases,
  DATABASE_ID,
} from '@/services/appwrite';
import { postBridgeApiJsonWithMeta } from '@/lib/platform-api';
import { executeFunctionWithMeta } from '@/integrations/appwrite/executeFunction';
import type {
  HealthAiDryRunAnalyzeResponse,
  HealthAiDryRunPlanResponse,
  HealthAiExecuteOneResponse,
  HealthAiSuggestion,
  HealthDryRunAnswers,
  Site,
  SiteAppIconPreviewResult,
  SitePagespeedResult,
  SitePagespeedScores,
} from '@/types';
import { useAuth } from '@/domains/auth';
import { useTeamsList } from '@/domains/teams';
import { useWorkspaceContext } from '@/domains/workspace';
import {
  forEachStoredPagespeed,
  getPagespeedFromSession,
  isSitePagespeedSessionComplete,
  setPagespeedInSession,
} from '../pagespeedSessionCache';
import { mapSiteDocumentToSite } from '../mappers';
import {
  hasBothPagespeedStrategiesInPerformanceMeta,
  pagespeedResultFromPerformanceMeta,
} from '../performanceMeta';
import { siteDocAccessibleForSession, sitesListQueries, sitesListQueriesForAdminInstall } from '../queries';
import {
  healthAiDryRunAnalyze,
  healthAiDryRunPlan,
  healthAiExecuteOne,
  invokeUptimeRobot,
  SITE_HEARTBEAT_POKE_FUNCTION_ID,
  SITES_FUNCTION_ID,
  type HealthAiDryRunContextOverrides,
} from '../api';
import {
  dashboardUptimeBarsQueryKey,
  dashboardUptimeIncidentsQueryKey,
  siteAppIconPreviewQueryKey,
  sitePagespeedQueryKey,
  uptimeMonitorQueryKey,
  type SitePagespeedStrategy,
} from '../queryKeys';

export {
  dashboardUptimeBarsQueryKey,
  dashboardUptimeIncidentsQueryKey,
  healthAiDryRunAnalyze,
  healthAiDryRunPlan,
  healthAiExecuteOne,
  siteAppIconPreviewQueryKey,
  sitePagespeedQueryKey,
  uptimeMonitorQueryKey,
  type HealthAiDryRunContextOverrides,
  type SitePagespeedStrategy,
};

const STATUS_POLL_INTERVAL_MS = 60_000;

function jwtFromCreateResponse(jwtRes: unknown): string {
  if (typeof jwtRes === 'string') return jwtRes;
  const o = jwtRes as { jwt?: string };
  return typeof o?.jwt === 'string' ? o.jwt : '';
}

type HeartbeatPokeResponse = {
  success?: boolean;
  message?: string;
  httpStatus?: number;
};

/**
 * Calls `site-heartbeat-poke` with `{ siteId, jwt }` so the platform GETs the WordPress
 * `/heartbeat/poke` endpoint (nudges the bridge to send a heartbeat).
 */
export const useRequestBridgeHeartbeatPoke = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<HeartbeatPokeResponse, Error, string>({
    mutationFn: async (siteId: string) => {
      const jwt = jwtFromCreateResponse(await account.createJWT());
      const { data, statusCode } = await executeFunctionWithMeta<HeartbeatPokeResponse>(
        SITE_HEARTBEAT_POKE_FUNCTION_ID,
        { siteId, jwt },
        { throwOnHttpError: false },
      );
      if (statusCode < 200 || statusCode >= 300) {
        const msg =
          typeof data?.message === 'string' && data.message
            ? data.message
            : `Request failed (${statusCode})`;
        throw new Error(msg);
      }
      if (!data?.success) {
        throw new Error(data?.message || 'Heartbeat poke did not succeed.');
      }
      return data;
    },
    onSuccess: (_, siteId) => {
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      if (user?.$id) void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
    },
  });
};

/**
 * Triggers `check_site_health` on the sites function so the bridge sends fresh health data to the Hub.
 */
export const useRequestSiteHealthRefresh = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<{ message: string }, Error, string>({
    mutationFn: async (siteId: string) => {
      const jwt = jwtFromCreateResponse(await account.createJWT());
      const { statusCode, data } = await executeFunctionWithMeta<Record<string, unknown>>(
        SITES_FUNCTION_ID,
        { action: 'check_site_health', siteId, jwt },
        { timeoutMs: 120_000, throwOnHttpError: false },
      );
      if (statusCode < 200 || statusCode >= 300) {
        const raw = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
        const nested =
          raw.error && typeof raw.error === 'object'
            ? (raw.error as { message?: string }).message
            : undefined;
        const msg =
          (typeof raw.message === 'string' && raw.message.trim()
            ? raw.message.trim()
            : typeof nested === 'string' && nested.trim()
              ? nested.trim()
              : null) ?? `Request failed (${statusCode})`;
        throw new Error(msg);
      }
      const raw = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
      const message =
        typeof raw.message === 'string' && raw.message.trim()
          ? raw.message.trim()
          : 'Updated health data was sent from the site to the hub.';
      return { message };
    },
    onSuccess: (_, siteId) => {
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      if (user?.$id) void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
    },
  });
};

export const useSites = () => {
  const { user } = useAuth();
  const ws = useWorkspaceContext();

  return useQuery<Site[], Error>({
    queryKey: ['sites', user?.$id, ws.workspaceQueryKey],
    queryFn: async () => {
      if (!user?.$id) return [];
      if (ws.mode === 'team' && !ws.activeTeamId) return [];
      const queries = sitesListQueries(ws.mode, user.$id, ws.activeTeamId);
      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SITES, queries);
      return response.documents.map((doc) => mapSiteDocumentToSite(doc as Record<string, unknown>));
    },
    enabled: !!user?.$id && (ws.mode !== 'team' || !!ws.activeTeamId),
  });
};

/**
 * Sites available for library → site install pickers.
 * Platform admins see all personal sites plus sites on every team they belong to.
 */
export const useSitesForLibraryInstall = () => {
  const { user, isAdmin } = useAuth();
  const ws = useWorkspaceContext();
  const teamsQ = useTeamsList(Boolean(user && isAdmin));

  const teamIds = useMemo(
    () => (teamsQ.data ?? []).map((row) => row.team.$id).filter(Boolean),
    [teamsQ.data],
  );

  return useQuery<Site[], Error>({
    queryKey: [
      'sites',
      user?.$id,
      isAdmin ? 'admin-library-install' : ws.workspaceQueryKey,
      isAdmin ? teamIds.join(',') : '',
    ],
    queryFn: async () => {
      if (!user?.$id) return [];
      const queries = isAdmin
        ? sitesListQueriesForAdminInstall(user.$id, teamIds)
        : sitesListQueries(ws.mode, user.$id, ws.activeTeamId);
      if (!isAdmin && ws.mode === 'team' && !ws.activeTeamId) return [];
      const response = await databases.listDocuments(DATABASE_ID, COLLECTIONS.SITES, queries);
      const byId = new Map<string, Site>();
      for (const doc of response.documents) {
        const site = mapSiteDocumentToSite(doc as Record<string, unknown>);
        byId.set(site.$id, site);
      }
      return [...byId.values()];
    },
    enabled:
      !!user?.$id && (isAdmin ? !teamsQ.isLoading : ws.mode !== 'team' || !!ws.activeTeamId),
  });
};

/** Payload returned after create/update when the bridge stores optional follow-up fields on the document. */
export type SiteBridgeMutationResult = Site & {
  siteSecret?: string;
  site_secret?: string;
  encrypted_api_key?: string;
};

export type AddSiteInput = {
  siteUrl: string;
  siteName: string;
  username?: string;
  /** Plain bridge secret (stored in `api_key`). */
  apiKey: string;
  /** Override workspace for this row (defaults to current active workspace). */
  attachWorkspace?: 'personal' | 'team';
  attachTeamId?: string;
};

export type UpdateSiteBridgeInput = {
  siteId: string;
  apiKey: string;
  /** When set (e.g. connect callback `site_name`), updates the site row display name. */
  siteName?: string;
  attachWorkspace?: 'personal' | 'team';
  attachTeamId?: string;
};

export type TransferSiteWorkspaceInput = {
  siteId: string;
  attachWorkspace: 'personal' | 'team';
  attachTeamId?: string;
};

/**
 * Registers a new site row for the current user (WordPress bridge connect flow).
 */
export const useAddSite = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<SiteBridgeMutationResult, Error, AddSiteInput>({
    mutationFn: async (input) => {
      if (!user?.$id) throw new Error('Not signed in.');
      const { data, statusCode } = await executeFunctionWithMeta<{
        success?: boolean;
        message?: string;
        document?: Record<string, unknown>;
        site_secret?: string;
      }>(
        SITES_FUNCTION_ID,
        {
          action: 'create_site',
          site_url: input.siteUrl.replace(/\/$/, ''),
          site_name: input.siteName,
          ...(input.username?.trim() ? { username: input.username.trim() } : {}),
          bridge_secret: input.apiKey,
          bridge_status: 'connected',
          ...(input.attachWorkspace === 'personal'
            ? { attach_workspace: 'personal' }
            : input.attachWorkspace === 'team' && input.attachTeamId?.trim()
              ? { attach_workspace: 'team', attach_team_id: input.attachTeamId.trim() }
              : {}),
        },
        { throwOnHttpError: false },
      );
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : `Create site failed (${statusCode})`,
        );
      }
      if (!data?.success || !data.document) {
        throw new Error(
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : 'Create site failed.',
        );
      }
      const raw = data.document as Record<string, unknown>;
      const plainSecret =
        typeof data.site_secret === 'string' && data.site_secret.trim()
          ? data.site_secret.trim()
          : typeof raw.site_secret === 'string'
            ? raw.site_secret
            : undefined;
      return {
        ...mapSiteDocumentToSite(raw),
        siteSecret: plainSecret,
        site_secret: plainSecret,
        encrypted_api_key: typeof raw.encrypted_api_key === 'string' ? raw.encrypted_api_key : undefined,
      };
    },
    onSuccess: (data) => {
      if (user?.$id) {
        void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
      }
      if (data.status === 'connected' && String(data.siteUrl || '').trim() && data.enabled !== false) {
        void invokeUptimeRobot(data.$id, 'ensure').catch(() => {});
      }
    },
  });
};

/**
 * Move a site to another workspace (personal or a team you belong to).
 */
export const useTransferSiteWorkspace = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<Site, Error, TransferSiteWorkspaceInput>({
    mutationFn: async (input) => {
      if (!user?.$id) throw new Error('Not signed in.');
      const { data, statusCode } = await executeFunctionWithMeta<{
        success?: boolean;
        message?: string;
        document?: Record<string, unknown>;
      }>(
        SITES_FUNCTION_ID,
        {
          action: 'update_site',
          siteId: input.siteId,
          updates:
            input.attachWorkspace === 'personal'
              ? { attach_workspace: 'personal' }
              : {
                  attach_workspace: 'team',
                  attach_team_id: input.attachTeamId?.trim() ?? '',
                },
        },
        { throwOnHttpError: false },
      );
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : `Transfer site failed (${statusCode})`,
        );
      }
      if (!data?.success || !data.document) {
        throw new Error(
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : 'Transfer site failed.',
        );
      }
      return mapSiteDocumentToSite(data.document as Record<string, unknown>);
    },
    onSuccess: (data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['site', variables.siteId] });
      if (user?.$id) void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
      if (data.enabled !== false) {
        void invokeUptimeRobot(variables.siteId, 'ensure').catch(() => {});
      }
    },
  });
};

/**
 * Updates bridge credentials for an existing site (same user).
 */
export const useUpdateSite = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation<SiteBridgeMutationResult, Error, UpdateSiteBridgeInput>({
    mutationFn: async (input) => {
      if (!user?.$id) throw new Error('Not signed in.');
      const trimmedName = input.siteName?.trim();
      const { data, statusCode } = await executeFunctionWithMeta<{
        success?: boolean;
        message?: string;
        document?: Record<string, unknown>;
        site_secret?: string;
      }>(
        SITES_FUNCTION_ID,
        {
          action: 'update_site',
          siteId: input.siteId,
          updates: {
            bridge_secret: input.apiKey,
            bridge_status: 'connected',
            ...(trimmedName ? { site_name: trimmedName } : {}),
            ...(input.attachWorkspace === 'personal'
              ? { attach_workspace: 'personal' }
              : input.attachWorkspace === 'team' && input.attachTeamId?.trim()
                ? { attach_workspace: 'team', attach_team_id: input.attachTeamId.trim() }
                : {}),
          },
        },
        { throwOnHttpError: false },
      );
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : `Update site failed (${statusCode})`,
        );
      }
      if (!data?.success || !data.document) {
        throw new Error(
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : 'Update site failed.',
        );
      }
      const raw = data.document as Record<string, unknown>;
      const plainSecret =
        typeof data.site_secret === 'string' && data.site_secret.trim()
          ? data.site_secret.trim()
          : typeof raw.site_secret === 'string'
            ? raw.site_secret
            : undefined;
      return {
        ...mapSiteDocumentToSite(raw),
        siteSecret: plainSecret,
        site_secret: plainSecret,
        encrypted_api_key: typeof raw.encrypted_api_key === 'string' ? raw.encrypted_api_key : undefined,
      };
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['site', variables.siteId] });
      if (user?.$id) void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
      if (_data.enabled !== false) {
        void invokeUptimeRobot(variables.siteId, 'ensure').catch(() => {});
      }
    },
  });
};

export type SetSiteEnabledInput = {
  siteId: string;
  /** When `false`, the site is hidden from default lists and the UptimeRobot monitor is paused. */
  enabled: boolean;
};

/**
 * Toggle `meta_data.enabled` on the site document and pause/resume the UptimeRobot monitor.
 */
export const useSetSiteEnabled = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const ws = useWorkspaceContext();

  return useMutation<Site, Error, SetSiteEnabledInput>({
    mutationFn: async ({ siteId, enabled }) => {
      if (!user?.$id) throw new Error('Not signed in.');
      const document = await databases.getDocument(DATABASE_ID, COLLECTIONS.SITES, siteId);
      const d = document as { user_id?: string | null; team_id?: string | null };
      if (!siteDocAccessibleForSession(user.$id, d, ws)) {
        throw new Error('No access to this site.');
      }
      let meta: Record<string, unknown> = {};
      const rawMeta =
        (document as { meta_data?: string; metaData?: string }).meta_data ??
        (document as { metaData?: string }).metaData;
      if (typeof rawMeta === 'string' && rawMeta.trim()) {
        try {
          const p = JSON.parse(rawMeta) as unknown;
          if (p && typeof p === 'object' && !Array.isArray(p)) meta = p as Record<string, unknown>;
        } catch {
          /* keep empty meta */
        }
      }
      meta.enabled = enabled;
      const metaJson = JSON.stringify(meta);

      const { data, statusCode } = await executeFunctionWithMeta<{
        success?: boolean;
        message?: string;
        document?: Record<string, unknown>;
      }>(
        SITES_FUNCTION_ID,
        {
          action: 'update_site',
          siteId,
          updates: { meta_data: metaJson },
        },
        { throwOnHttpError: false },
      );
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : `Update site failed (${statusCode})`,
        );
      }
      if (!data?.success || !data.document) {
        throw new Error(
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : 'Update site failed.',
        );
      }
      return mapSiteDocumentToSite(data.document as Record<string, unknown>);
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['site', variables.siteId] });
      if (user?.$id) void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
      void invokeUptimeRobot(variables.siteId, variables.enabled ? 'resume' : 'pause').catch(() => {});
    },
  });
};

/**
 * Deletes the site row for the current user (platform document only; does not uninstall the bridge).
 */
export const useDeleteSite = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const ws = useWorkspaceContext();

  return useMutation<void, Error, string>({
    mutationFn: async (siteId: string) => {
      if (!user?.$id) throw new Error('Not signed in.');
      if (!ws.teamWorkspaceReady) throw new Error('Workspace is still loading.');
      const document = await databases.getDocument(DATABASE_ID, COLLECTIONS.SITES, siteId);
      const d = document as { user_id?: string | null; team_id?: string | null };
      if (!siteDocAccessibleForSession(user.$id, d, ws)) {
        throw new Error('No access to this site.');
      }
      try {
        await invokeUptimeRobot(siteId, 'delete');
      } catch {
        /* best-effort: remove site row even if Uptime Robot cleanup fails */
      }
      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.SITES, siteId);
    },
    onSuccess: (_data, siteId) => {
      void queryClient.removeQueries({ queryKey: ['site', siteId] });
      if (user?.$id) void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
    },
  });
};

export const useSite = (siteId: string | undefined) => {
  const { user } = useAuth();
  const ws = useWorkspaceContext();

  return useQuery<Site, Error>({
    queryKey: ['site', siteId, ws.workspaceQueryKey],
    queryFn: async () => {
      if (!siteId) throw new Error('Site ID is required.');

      const document = await databases.getDocument(DATABASE_ID, COLLECTIONS.SITES, siteId);
      const d = document as { user_id?: string | null; team_id?: string | null };
      if (!siteDocAccessibleForSession(user?.$id, d, ws)) {
        throw new Error('No access to this site.');
      }

      return mapSiteDocumentToSite(document as Record<string, unknown>);
    },
    enabled: !!siteId && !!user && ws.teamWorkspaceReady,
    retry: 1,
  });
};

export const useSitesStatusPoll = (siteIds: string[], intervalMs = STATUS_POLL_INTERVAL_MS) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const ws = useWorkspaceContext();

  useEffect(() => {
    if (!user || siteIds.length === 0) return;
    const id = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
      siteIds.forEach((sid) => void queryClient.invalidateQueries({ queryKey: ['site', sid] }));
    }, intervalMs);
    return () => clearInterval(id);
  }, [siteIds.join(','), user?.$id, ws.workspaceQueryKey, intervalMs, queryClient, user, siteIds]);
};

/** PageSpeed is refreshed only manually or by session prefetch — not time-based. */
const PAGESPEED_STALE_MS = Infinity;

type LegacyStrategyBlock = {
  ok?: boolean;
  scores?: SitePagespeedScores;
  coreWebVitals?: SitePagespeedResult['coreWebVitals'];
  analyzedUrl?: string;
  lighthouseVersion?: string;
  message?: string;
};

/** Appwrite occasionally returns a JSON string body; unwrap once. */
function unwrapJsonBody(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const t = raw.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    return raw;
  }
}

/**
 * New `site-pagespeed` returns one strategy per call. Older deployments returned `{ desktop, mobile }` in one response.
 */
function normalizeSitePagespeedPayload(raw: unknown, strategy: SitePagespeedStrategy): SitePagespeedResult {
  const data = unwrapJsonBody(raw);
  if (!data || typeof data !== 'object') {
    throw new Error('PageSpeed returned an empty or invalid response.');
  }
  const o = data as Record<string, unknown>;

  if (o.success === true && o.scores && typeof o.scores === 'object') {
    const st: SitePagespeedStrategy =
      o.strategy === 'mobile' || o.strategy === 'desktop' ? o.strategy : strategy;
    return {
      success: true,
      strategy: st,
      scores: o.scores as SitePagespeedScores,
      coreWebVitals: o.coreWebVitals as SitePagespeedResult['coreWebVitals'],
      analyzedUrl: typeof o.analyzedUrl === 'string' ? o.analyzedUrl : undefined,
      lighthouseVersion: typeof o.lighthouseVersion === 'string' ? o.lighthouseVersion : undefined,
      message: typeof o.message === 'string' ? o.message : undefined,
    };
  }

  const legacy = o[strategy] as LegacyStrategyBlock | undefined;
  if (legacy) {
    if (legacy.ok === true && legacy.scores && typeof legacy.scores === 'object') {
      return {
        success: true,
        strategy,
        scores: legacy.scores,
        coreWebVitals: legacy.coreWebVitals,
        analyzedUrl:
          (typeof legacy.analyzedUrl === 'string' ? legacy.analyzedUrl : undefined) ||
          (typeof o.analyzedUrl === 'string' ? o.analyzedUrl : undefined),
        lighthouseVersion: typeof legacy.lighthouseVersion === 'string' ? legacy.lighthouseVersion : undefined,
      };
    }
    if (legacy.ok === false && typeof legacy.message === 'string' && legacy.message) {
      throw new Error(legacy.message);
    }
  }

  const topMsg = typeof o.message === 'string' ? o.message : '';
  const legacyHint =
    o.desktop != null || o.mobile != null
      ? ' If this persists, redeploy the latest site-pagespeed function and hard-refresh the app (old bundles expected both strategies in one response).'
      : '';
  throw new Error(
    (topMsg || `PageSpeed did not return ${strategy} scores.`) + legacyHint,
  );
}

export async function fetchSitePagespeedResult(
  siteId: string,
  strategy: SitePagespeedStrategy,
): Promise<SitePagespeedResult> {
  const jwtRes = await account.createJWT();
  const jwt = typeof jwtRes === 'string' ? jwtRes : (jwtRes as { jwt?: string }).jwt ?? '';
  const { data, statusCode } = await executeFunctionWithMeta<unknown>(
    SITES_FUNCTION_ID,
    { action: 'run_pagespeed', siteId, jwt, strategy },
    { throwOnHttpError: false, longRunning: true, maxAsyncWaitMs: 240_000 },
  );
  if (statusCode < 200 || statusCode >= 300) {
    const parsed = unwrapJsonBody(data);
    const msg =
      parsed && typeof parsed === 'object' && typeof (parsed as { message?: string }).message === 'string'
        ? (parsed as { message: string }).message
        : `PageSpeed request failed (${statusCode})`;
    throw new Error(msg);
  }
  return normalizeSitePagespeedPayload(data, strategy);
}

/**
 * Hydrates PageSpeed from sessionStorage, prefetches desktop+mobile for sites missing data (new tab / new site).
 * Call from the authenticated shell (e.g. MainLayout) with the user’s site list.
 */
export const useSitesPagespeedSessionBootstrap = (sites: Site[] | undefined) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const prefetchGen = useRef(0);

  const eligibleKey = useMemo(() => {
    return (sites ?? [])
      .filter((s) => s.enabled !== false && Boolean(s.siteUrl?.trim()))
      .map((s) => s.$id)
      .sort()
      .join('\u0001');
  }, [sites]);

  useEffect(() => {
    if (!user?.$id) return;
    forEachStoredPagespeed(user.$id, (siteId, strategy, data) => {
      queryClient.setQueryData(sitePagespeedQueryKey(siteId, strategy), data);
    });
  }, [user?.$id, queryClient]);

  useEffect(() => {
    if (!user?.$id || !eligibleKey) return;
    const eligible = eligibleKey.split('\u0001').filter(Boolean);
    if (eligible.length === 0) return;

    const pending = eligible.filter((id) => {
      if (isSitePagespeedSessionComplete(user.$id, id)) return false;
      const row = (sites ?? []).find((s) => s.$id === id);
      if (row && hasBothPagespeedStrategiesInPerformanceMeta(row.performanceMeta)) return false;
      return true;
    });
    if (pending.length === 0) return;

    const gen = ++prefetchGen.current;
    void (async () => {
      for (const siteId of pending) {
        if (gen !== prefetchGen.current) return;
        for (const strategy of ['desktop', 'mobile'] as const) {
          if (gen !== prefetchGen.current) return;
          const cached = getPagespeedFromSession(user.$id, siteId, strategy);
          if (cached) {
            queryClient.setQueryData(sitePagespeedQueryKey(siteId, strategy), cached);
            continue;
          }
          const siteRow = (sites ?? []).find((s) => s.$id === siteId);
          const fromMeta = pagespeedResultFromPerformanceMeta(siteRow?.performanceMeta, strategy);
          if (fromMeta) {
            queryClient.setQueryData(sitePagespeedQueryKey(siteId, strategy), fromMeta);
            continue;
          }
          try {
            const data = await fetchSitePagespeedResult(siteId, strategy);
            if (gen !== prefetchGen.current) return;
            setPagespeedInSession(user.$id, siteId, strategy, data);
            queryClient.setQueryData(sitePagespeedQueryKey(siteId, strategy), data);
            void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
            void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
          } catch {
            /* skip failed strategy; user can retry from site detail */
          }
        }
      }
    })();
  }, [user?.$id, eligibleKey, queryClient, sites]);

  useEffect(() => {
    if (!user?.$id || !sites?.length) return;
    for (const site of sites) {
      if (!site.$id || site.enabled === false) continue;
      for (const strategy of ['desktop', 'mobile'] as const) {
        if (getPagespeedFromSession(user.$id, site.$id, strategy)) continue;
        const fromDoc = pagespeedResultFromPerformanceMeta(site.performanceMeta, strategy);
        if (fromDoc) {
          queryClient.setQueryData(sitePagespeedQueryKey(site.$id, strategy), fromDoc);
        }
      }
    }
  }, [user?.$id, sites, queryClient]);
};

/**
 * Runs PageSpeed for one strategy when `fetchEnabled` is true (typically the active Sitespeed tab).
 * Inactive tab still shows data from React Query cache / session hydration without refetching.
 */
export const useSitePagespeedStrategy = (
  siteId: string | undefined,
  strategy: SitePagespeedStrategy,
  fetchEnabled: boolean,
  /** Latest `sites.performance_meta` from the site document (hydrates cache when session is empty). */
  performanceMeta?: string,
) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const initialFromSession =
    user?.$id && siteId ? getPagespeedFromSession(user.$id, siteId, strategy) : undefined;
  const initialFromDocument = pagespeedResultFromPerformanceMeta(performanceMeta, strategy);

  return useQuery<SitePagespeedResult, Error>({
    queryKey: sitePagespeedQueryKey(siteId ?? '__none__', strategy),
    queryFn: async () => {
      if (!siteId) throw new Error('Site ID is required.');
      const result = await fetchSitePagespeedResult(siteId, strategy);
      if (user?.$id) setPagespeedInSession(user.$id, siteId, strategy, result);
      void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      if (user?.$id) void queryClient.invalidateQueries({ queryKey: ['sites', user.$id] });
      return result;
    },
    initialData: initialFromSession ?? initialFromDocument,
    enabled: Boolean(siteId && user && fetchEnabled),
    staleTime: PAGESPEED_STALE_MS,
    retry: 0,
  });
};

const APP_ICON_STALE_MS = 10 * 60_000;

/**
 * Fetches `img#app-icon-preview` src from the site’s public HTML (server-side in Appwrite; avoids CORS).
 */
export const useSiteAppIconPreview = (siteId: string | undefined, siteUrl: string | undefined) => {
  const { user } = useAuth();
  const urlOk = Boolean(siteUrl?.trim());

  return useQuery<SiteAppIconPreviewResult, Error>({
    queryKey: siteAppIconPreviewQueryKey(siteId ?? '__none__'),
    queryFn: async () => {
      if (!siteId) throw new Error('Site ID is required.');
      const jwtRes = await account.createJWT();
      const jwt = typeof jwtRes === 'string' ? jwtRes : (jwtRes as { jwt?: string }).jwt ?? '';
      const { data, statusCode } = await executeFunctionWithMeta<unknown>(
        'site-app-icon-preview',
        { siteId, jwt },
        { throwOnHttpError: false, longRunning: true, maxAsyncWaitMs: 60_000 },
      );
      if (statusCode < 200 || statusCode >= 300) {
        const parsed = unwrapJsonBody(data) as Record<string, unknown> | null;
        const msg =
          parsed && typeof parsed.message === 'string'
            ? parsed.message
            : `App icon preview request failed (${statusCode})`;
        return { success: false as const, message: msg };
      }
      const parsed = unwrapJsonBody(data) as Record<string, unknown> | null;
      if (parsed && parsed.success === true && typeof parsed.src === 'string' && parsed.src.trim()) {
        return {
          success: true as const,
          src: parsed.src.trim(),
          fetchedUrl: typeof parsed.fetchedUrl === 'string' ? parsed.fetchedUrl : undefined,
          source: typeof parsed.source === 'string' ? parsed.source : undefined,
        };
      }
      const msg =
        parsed && typeof parsed.message === 'string' ? parsed.message : 'No app icon preview on this site.';
      return { success: false as const, message: msg };
    },
    enabled: Boolean(siteId && user && urlOk),
    staleTime: APP_ICON_STALE_MS,
    retry: 0,
  });
};

export type SiteUptimeMonitorResult = {
  monitor: Record<string, unknown> | null;
  incidents: Record<string, unknown>[];
  message?: string;
};

/**
 * Live UptimeRobot monitor + incidents for a site (≤30d incidents server-side).
 */
export const useSiteUptimeMonitor = (siteId: string | undefined) => {
  const { user } = useAuth();

  return useQuery<SiteUptimeMonitorResult | null, Error>({
    queryKey: [...uptimeMonitorQueryKey(siteId ?? '__none__'), user?.$id],
    queryFn: async () => {
      if (!siteId || !user?.$id) return null;
      const jwt = jwtFromCreateResponse(await account.createJWT());
      const { data, statusCode } = await executeFunctionWithMeta<{
        success?: boolean;
        monitor?: Record<string, unknown> | null;
        incidents?: Record<string, unknown>[];
        message?: string;
      }>(
        APPWRITE_FUNCTION_IDS.UPTIME_ROBOT,
        {
          action: 'get_monitor',
          jwt,
          siteId,
          includeIncidents: true,
          incidentsMaxAgeDays: 30,
        },
        { throwOnHttpError: false },
      );
      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : `Uptime monitor failed (${statusCode})`,
        );
      }
      if (data?.success === false) {
        return {
          monitor: null,
          incidents: [],
          message: typeof data?.message === 'string' ? data.message : undefined,
        };
      }
      return {
        monitor: data?.monitor ?? null,
        incidents: Array.isArray(data?.incidents) ? data.incidents : [],
        message: typeof data?.message === 'string' ? data.message : undefined,
      };
    },
    enabled: Boolean(siteId && user?.$id),
    staleTime: 45_000,
    retry: 1,
  });
};

/**
 * Recent incidents across workspace monitors (dashboard widget; limit/maxAge server-side).
 */
export const useDashboardUptimeIncidents = () => {
  const { user } = useAuth();
  const ws = useWorkspaceContext();

  return useQuery<Record<string, unknown>[], Error>({
    queryKey: dashboardUptimeIncidentsQueryKey(ws.workspaceQueryKey),
    queryFn: async () => {
      if (!user?.$id) return [];
      const jwt = jwtFromCreateResponse(await account.createJWT());
      const { data, statusCode } = await executeFunctionWithMeta<{
        success?: boolean;
        incidents?: Record<string, unknown>[];
      }>(
        APPWRITE_FUNCTION_IDS.UPTIME_ROBOT,
        {
          action: 'get_recent_incidents',
          jwt,
          limit: 30,
          maxAgeDays: 7,
        },
        { throwOnHttpError: false },
      );
      if (statusCode < 200 || statusCode >= 300) return [];
      return Array.isArray(data?.incidents) ? data.incidents : [];
    },
    enabled: Boolean(user?.$id && (ws.mode !== 'team' || ws.activeTeamId)),
    staleTime: 120_000,
    retry: 0,
  });
};

/**
 * Incidents for dashboard site uptime bars (24h window; one fetch for the whole table).
 */
export const useDashboardUptimeBarsIncidents = () => {
  const { user } = useAuth();
  const ws = useWorkspaceContext();

  return useQuery<Record<string, unknown>[], Error>({
    queryKey: dashboardUptimeBarsQueryKey(ws.workspaceQueryKey),
    queryFn: async () => {
      if (!user?.$id) return [];
      const jwt = jwtFromCreateResponse(await account.createJWT());
      const { data, statusCode } = await executeFunctionWithMeta<{
        success?: boolean;
        incidents?: Record<string, unknown>[];
      }>(
        APPWRITE_FUNCTION_IDS.UPTIME_ROBOT,
        {
          action: 'get_recent_incidents',
          jwt,
          limit: 50,
          maxAgeDays: 2,
        },
        { throwOnHttpError: false },
      );
      if (statusCode < 200 || statusCode >= 300) return [];
      return Array.isArray(data?.incidents) ? data.incidents : [];
    },
    enabled: Boolean(user?.$id && (ws.mode !== 'team' || ws.activeTeamId)),
    staleTime: 120_000,
    retry: 0,
  });
};
