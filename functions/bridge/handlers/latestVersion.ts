import {
  ok,
  fail,
  WPHUB_APPWRITE_IDS,
  getPlatformSettingJson,
  describeApiKeyResolution,
  isBridgeSemver,
  resolveActiveBridgeDownloadRow,
} from '@code045/wphubpro-shared';
import { parseVersionFromName, compareVersions } from '../lib/bridgeVersion.ts';
import { replaceCurrentWithHistory } from '../lib/bridgeState.ts';
import type { BridgeAppwriteReq, BridgeAppwriteRes, BridgeCtx, BridgePayload } from '../lib/types.ts';

const BRIDGE_BUCKET_ID = WPHUB_APPWRITE_IDS.buckets.bridge;
const PLATFORM_SETTINGS_KEY = 'bridge_plugin';

function releasedSemverForSync(payload: BridgePayload): string | null {
  const fromBody = String(payload.version || '').trim();
  if (isBridgeSemver(fromBody)) return fromBody;
  return null;
}

export default async function handleLatestVersion({
  req,
  res,
  log,
  error,
  databases,
  storage,
}: BridgeCtx & { req: BridgeAppwriteReq; res: BridgeAppwriteRes }) {
  const payload = (req._parsedPayload || {}) as BridgePayload;

  try {
    const settingsJson = await getPlatformSettingJson(databases, PLATFORM_SETTINGS_KEY);

    if (payload.file_id && typeof payload.file_id === 'string') {
      const resolvedVersion = releasedSemverForSync(payload);
      if (!resolvedVersion) {
        return fail(
          res,
          'Could not determine released bridge version: pass `version` (semver x.y.z) in the request body together with `file_id`.',
          400,
        );
      }
      await replaceCurrentWithHistory(databases, {
        file_id: payload.file_id.trim(),
        version: resolvedVersion,
      });
      return ok(res, {
        success: true,
        version: resolvedVersion,
        uploaded_at: null,
      });
    }

    const resolved = await resolveActiveBridgeDownloadRow(databases, (m) => log(`[bridge] ${m}`));
    if (!resolved) {
      const files = await storage.listFiles(BRIDGE_BUCKET_ID, []);
      const withVersions = (files.files || [])
        .map((f) => ({ version: parseVersionFromName(f.name) }))
        .filter((f): f is { version: string } => f.version != null);

      if (withVersions.length === 0) {
        return fail(res, 'No bridge version found.', 404);
      }

      withVersions.sort((a, b) => compareVersions(b.version, a.version));
      const fallbackVer = withVersions[0].version;
      log(`[bridge] latest_version: read-only fallback from storage ${fallbackVer}`);
      return ok(res, {
        success: true,
        version: fallbackVer,
        uploaded_at: null,
      });
    }

    const parsed = settingsJson as Record<string, unknown>;
    const uploadedAt =
      (typeof parsed.active_set_at === 'string' && parsed.active_set_at.trim()) ||
      (typeof parsed.uploaded_at === 'string' && parsed.uploaded_at.trim()) ||
      null;

    log(`[bridge] latest_version: read-only ${resolved.version} (source=${resolved.source})`);

    return ok(res, {
      success: true,
      version: resolved.version,
      uploaded_at: uploadedAt,
    });
  } catch (e) {
    error(`[bridge] latest_version: ${(e as Error).message}`);
    return fail(res, (e as Error).message || 'Failed to resolve bridge version.', 500, {
      _authKeySource: describeApiKeyResolution(req).source,
    });
  }
}
