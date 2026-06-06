import { ok, fail } from '@code045/wphubpro-shared';
import { listBridgeReleasedVersions } from '@code045/wphubpro-shared';

export default async function handleListBridgeVersions({ res, error, databases }) {
  try {
    const versions = await listBridgeReleasedVersions(databases);
    return ok(res, { success: true, versions });
  } catch (e) {
    error(e.message);
    return fail(res, e.message, 500);
  }
};
