import { ok, fail, resolveActiveBridgeDownloadRow } from '@code045/wphubpro-shared';
import type { BridgeCtx } from '../lib/types.ts';

const BRIDGE_BUCKET_ID = process.env.APPWRITE_STORAGE_BUCKET_BRIDGE_ID || 'bridge';

export default async function handleGetDownloadUrl({
  res,
  log,
  error,
  storage,
  databases,
  endpoint,
  projectId,
}: BridgeCtx) {
  try {
    const resolved = await resolveActiveBridgeDownloadRow(databases, (m) => log(`[bridge] ${m}`));
    if (!resolved) {
      return fail(
        res,
        'No bridge release recorded (platform_settings bridge_plugin.version or platform_db/bridge/current). Run bridge-release first.',
        404,
      );
    }

    const fileId = resolved.file_id;
    const version = resolved.version;

    let fileName = `wphubpro-bridge-${version}.zip`;
    try {
      const file = await storage.getFile(BRIDGE_BUCKET_ID, fileId);
      if (file?.name) fileName = file.name;
    } catch (e) {
      if ((e as { code?: number }).code === 404) {
        return fail(res, 'Bridge zip file not found in storage for the recorded file_id.', 404);
      }
      log(`[bridge] get_download_url: getFile: ${(e as Error).message}`);
    }

    log(`[bridge] get_download_url: ${fileName} (${version}) source=${resolved.source}`);

    const baseUrl = String(endpoint).replace(/\/$/, '');
    const pid = String(projectId);
    const downloadUrl = `${baseUrl}/storage/buckets/${BRIDGE_BUCKET_ID}/files/${fileId}/download?project=${encodeURIComponent(pid)}`;

    return ok(res, {
      success: true,
      version,
      fileId,
      fileName,
      downloadUrl,
    });
  } catch (e) {
    error(`[bridge] get_download_url: ${(e as Error).message}`);
    return fail(res, (e as Error).message || 'Failed to get bridge download URL.', 500);
  }
}
