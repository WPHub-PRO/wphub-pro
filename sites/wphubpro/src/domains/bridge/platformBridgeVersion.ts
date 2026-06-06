import { isBridgePluginFile } from '@/domains/sites/pluginUpdateFromSite';
import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';
import { useQuery } from '@tanstack/react-query';

export const bridgePluginPlatformVersionQueryKey = ['bridge', 'platform_settings_version'] as const;

/** Same semantics as `functions/bridge/lib/bridgeVersion.js` `compareVersions`. Returns 1 if a>b, -1 if a<b, 0 if equal. */
export function compareBridgeVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

export function bridgeRowHasPlatformUpdate(
  p: { plugin?: string; version?: string },
  platformVersion: string | null | undefined,
): boolean {
  if (!isBridgePluginFile(String(p.plugin || ''))) return false;
  const plat = typeof platformVersion === 'string' ? platformVersion.trim() : '';
  if (!plat) return false;
  const installed = String(p.version || '').trim();
  if (!installed) return true;
  return compareBridgeVersions(plat, installed) > 0;
}

export async function fetchBridgePluginPlatformVersion(): Promise<string | null> {
  const res = await executeFunction<{ success?: boolean; version?: string | null }>(
    APPWRITE_FUNCTION_IDS.PLATFORM_SETTINGS,
    { action: 'bridge_plugin_version' },
    { omitImpersonationHeaders: true },
  );
  const v = res?.version;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

export function useBridgePluginPlatformVersion() {
  return useQuery({
    queryKey: bridgePluginPlatformVersionQueryKey,
    queryFn: () => fetchBridgePluginPlatformVersion(),
    staleTime: 60_000,
    retry: 1,
    throwOnError: false,
  });
}
