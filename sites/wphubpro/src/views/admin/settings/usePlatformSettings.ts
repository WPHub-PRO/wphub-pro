import { bridgePluginPlatformVersionQueryKey } from '@/domains/bridge/platformBridgeVersion';
import { publicPlatformBrandingQueryKey } from '@/domains/platform/publicBrandingApi';
import { publicHubLayoutQueryKey } from '@/domains/platform/publicHubLayoutApi';
import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface PlatformSettingItem {
  key: string;
  value: unknown;
}

export type BridgeReleasedVersionRow = {
  version: string;
  file_id: string;
  document_id: string;
  /** Appwrite document `$createdAt` (ISO), when known */
  created_at?: string;
};

async function fetchPlatformSettings(): Promise<PlatformSettingItem[]> {
  const res = await executeFunction<{ success?: boolean; items?: PlatformSettingItem[] }>(
    APPWRITE_FUNCTION_IDS.PLATFORM_SETTINGS,
    { action: 'get' },
    { omitImpersonationHeaders: true },
  );
  return Array.isArray(res?.items) ? res.items : [];
}

export function usePlatformSettingsList() {
  return useQuery({
    queryKey: ['admin', 'settings', 'platform-settings'],
    queryFn: () => fetchPlatformSettings(),
    enabled: true,
  });
}

async function fetchBridgeReleasedVersionsForAdmin(): Promise<BridgeReleasedVersionRow[]> {
  const res = await executeFunction<{ success?: boolean; versions?: BridgeReleasedVersionRow[] }>(
    APPWRITE_FUNCTION_IDS.PLATFORM_SETTINGS,
    { action: 'list_bridge_versions' },
    { omitImpersonationHeaders: true },
  );
  return Array.isArray(res?.versions) ? res.versions : [];
}

export function useBridgeReleasedVersionsForAdmin() {
  return useQuery({
    queryKey: ['admin', 'settings', 'bridge-versions'],
    queryFn: () => fetchBridgeReleasedVersionsForAdmin(),
    staleTime: 60_000,
    retry: 1,
    throwOnError: false,
  });
}

export type PlatformApiEnvRow = {
  key: string;
  value: string;
  variableId?: string;
};

export type PlatformApiEnvListResponse = {
  success?: boolean;
  items?: PlatformApiEnvRow[];
  managedKeys?: string[];
  scope?: 'project';
};

async function fetchPlatformApiEnv(): Promise<PlatformApiEnvListResponse> {
  return executeFunction<PlatformApiEnvListResponse>(
    APPWRITE_FUNCTION_IDS.PLATFORM_SETTINGS,
    { action: 'list_api_env' },
    { omitImpersonationHeaders: true },
  );
}

export function usePlatformApiEnvList() {
  return useQuery({
    queryKey: ['admin', 'settings', 'api-env'],
    queryFn: () => fetchPlatformApiEnv(),
    staleTime: 30_000,
  });
}

export function usePlatformApiEnvSave() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entries: PlatformApiEnvRow[]) => {
      return executeFunction<{ success?: boolean; message?: string }>(
        APPWRITE_FUNCTION_IDS.PLATFORM_SETTINGS,
        { action: 'save_api_env', entries },
        { omitImpersonationHeaders: true },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'api-env'] });
    },
  });
}

export function usePlatformSettingsUpsert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      category,
      settings,
    }: {
      category: string;
      settings: Record<string, unknown>;
    }) => {
      await executeFunction(
        APPWRITE_FUNCTION_IDS.PLATFORM_SETTINGS,
        { action: 'upsert', category, settings },
        { omitImpersonationHeaders: true },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'platform-settings'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings', 'bridge-versions'] });
      queryClient.invalidateQueries({ queryKey: ['public-auth-config'] });
      queryClient.invalidateQueries({ queryKey: publicPlatformBrandingQueryKey });
      queryClient.invalidateQueries({ queryKey: publicHubLayoutQueryKey });
      queryClient.invalidateQueries({ queryKey: ['bridge', 'advertised_version'] });
      queryClient.invalidateQueries({ queryKey: [...bridgePluginPlatformVersionQueryKey] });
    },
  });
}
