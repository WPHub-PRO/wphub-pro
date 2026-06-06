import { executeFunction } from '@/integrations/appwrite/executeFunction';
import {
  APPWRITE_PROJECT_ID,
  APPWRITE_FUNCTION_IDS,
  client,
  storage,
  STORAGE_BUCKETS,
} from '@/services/appwrite';

export type BridgeLatestVersionPayload = {
  success?: boolean;
  version?: string;
  uploaded_at?: string | null;
};

export type BridgeDownloadMetaPayload = {
  success?: boolean;
  version?: string;
  fileId?: string;
  fileName?: string;
  downloadUrl?: string;
};

const FN_OPTIONS = { omitImpersonationHeaders: true } as const;

export async function fetchBridgeLatestVersion(): Promise<BridgeLatestVersionPayload> {
  return executeFunction<BridgeLatestVersionPayload>(
    APPWRITE_FUNCTION_IDS.BRIDGE,
    { action: 'latest_version' },
    FN_OPTIONS,
  );
}

export async function fetchBridgeDownloadMeta(): Promise<BridgeDownloadMetaPayload> {
  return executeFunction<BridgeDownloadMetaPayload>(
    APPWRITE_FUNCTION_IDS.BRIDGE,
    { action: 'get_download_url' },
    FN_OPTIONS,
  );
}

function appwriteAuthHeaders(): Record<string, string> {
  const raw = client.headers as Record<string, string | undefined>;
  const out: Record<string, string> = { 'X-Appwrite-Project': APPWRITE_PROJECT_ID };
  for (const key of [
    'X-Appwrite-Session',
    'X-Appwrite-JWT',
    'X-Appwrite-Impersonate-User-Id',
    'X-Appwrite-Impersonate-User-Email',
    'X-Appwrite-Impersonate-User-Phone',
  ] as const) {
    const v = raw[key];
    if (v) out[key] = v;
  }
  return out;
}

/**
 * Pulls the bridge zip using the logged-in Appwrite session (private bucket).
 */
export async function downloadBridgePluginZip(fileId: string, fallbackName: string): Promise<void> {
  const url = storage.getFileDownload(STORAGE_BUCKETS.BRIDGE, fileId);
  const res = await fetch(url, { method: 'GET', headers: appwriteAuthHeaders() });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(t || `Download failed (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fallbackName.endsWith('.zip') ? fallbackName : `${fallbackName}.zip`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
