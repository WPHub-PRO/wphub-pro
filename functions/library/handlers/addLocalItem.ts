import { Buffer } from 'node:buffer';
import {
  fail,
  WPHUB_APPWRITE_IDS,
  resolveWorkspaceContext,
  Query,
  ID,
  Permission,
  Role,
  Databases,
  Users,
  Teams,
  Storage,
} from '@code045/wphubpro-shared';
import { switchUserToWorkspaceIfNeeded } from '../lib/switchWorkspaceIfNeeded.ts';
import { parseWordPressZip, normalizeWpSlug } from '../lib/parseWordPressZip.ts';
import {
  getOrBuildVersionsMap,
  setDefaultVersionInMap,
  ensureSingleDefaultInVersionMap,
  mirrorLegacyFieldsFromVersions,
  serializeVersionsJson,
} from '../lib/libraryVersions.ts';

function decodeBase64Zip(data: unknown): Uint8Array {
  let s = String(data ?? '').trim();
  const m = /^data:([^;]+);base64,(.+)$/i.exec(s);
  if (m) s = m[2];
  s = s.replace(/\s/g, '');
  return new Uint8Array(Buffer.from(s, 'base64'));
}

function dbId(): string {
  return String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

function libraryColl(): string {
  return String(
    process.env.APPWRITE_LIBRARY_COLLECTION_ID ||
      process.env.APPWRITE_LIBRARY_COLLECTION ||
      WPHUB_APPWRITE_IDS.platformTables.library,
  ).trim();
}

function workspaceDocumentPermissions(mode: string, authUserId: string, teamId: string) {
  if (mode === 'team' && teamId) {
    return [
      Permission.read(Role.team(teamId)),
      Permission.update(Role.team(teamId, ['owner'])),
      Permission.delete(Role.team(teamId, ['owner'])),
    ];
  }
  return [
    Permission.read(Role.user(authUserId)),
    Permission.update(Role.user(authUserId)),
    Permission.delete(Role.user(authUserId)),
  ];
}

function ownerFields(wsCtx: { mode: string; rowTeamId?: string | null; authUserId: string }) {
  if (wsCtx.mode === 'team' && wsCtx.rowTeamId) {
    return { team_id: wsCtx.rowTeamId };
  }
  return { user_id: wsCtx.authUserId };
}

async function findExistingLibrary(
  databases: Databases,
  wsCtx: { mode: string; rowTeamId?: string | null; authUserId: string },
  wpSlug: string,
  type: string,
) {
  const queries =
    wsCtx.mode === 'team' && wsCtx.rowTeamId
      ? [
          Query.equal('team_id', wsCtx.rowTeamId),
          Query.equal('wpSlug', wpSlug),
          Query.equal('type', type),
          Query.limit(1),
        ]
      : [
          Query.equal('user_id', wsCtx.authUserId),
          Query.equal('wpSlug', wpSlug),
          Query.equal('type', type),
          Query.limit(1),
        ];
  const res = await databases.listDocuments(dbId(), libraryColl(), queries);
  return (res.documents?.[0] as Record<string, unknown>) || null;
}

function bucketIdForLibraryType(type: string): string {
  return type === 'theme' ? WPHUB_APPWRITE_IDS.buckets.themes : WPHUB_APPWRITE_IDS.buckets.plugins;
}

function safeZipFileName(payload: Record<string, unknown>, slug: string, safeVer: string): string {
  const n = String(payload.fileName || payload.file_name || '').trim();
  if (n && /\.zip$/i.test(n)) return n;
  return `${slug}-${safeVer}.zip`;
}

export type LibraryHandlerCtx = {
  req: { _parsedPayload?: Record<string, unknown> };
  res: { json: (body: unknown, status?: number) => unknown };
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  databases: Databases;
  users: Users;
  teams: Teams;
  storage: Storage;
  actorUserId: string | null | undefined;
};

export async function handleAddLocalItem(ctx: LibraryHandlerCtx) {
  const { req, res, log, error, databases, users, teams, storage } = ctx;
  const payload = req._parsedPayload || {};
  const authUserId = String(ctx.actorUserId || '').trim();
  if (!authUserId) return fail(res, 'Unauthorized: could not resolve caller user.', 401);

  if (!storage || typeof storage.createFile !== 'function') {
    return fail(res, 'Storage client is not available on this function deployment.', 500);
  }

  const requestedUserId = String(payload.userId || payload.user_id || '').trim();
  if (requestedUserId && requestedUserId !== authUserId) {
    return fail(res, 'Forbidden: userId does not match authenticated user.', 403);
  }

  const typeRaw = String(payload.type || '').trim().toLowerCase();
  if (typeRaw !== 'plugin' && typeRaw !== 'theme') {
    return fail(res, 'Invalid type. Expected plugin or theme.', 400);
  }
  const type = typeRaw as 'plugin' | 'theme';

  const fileBase64 = payload.fileBase64 || payload.file_base64;
  if (!fileBase64) return fail(res, 'Missing fileBase64.', 400);

  let buf: Uint8Array;
  try {
    buf = decodeBase64Zip(fileBase64);
  } catch {
    return fail(res, 'Invalid base64 payload.', 400);
  }

  const clientTeamId = String(payload.teamId || payload.team_id || '').trim();
  if (clientTeamId) {
    const sw = await switchUserToWorkspaceIfNeeded({
      databases,
      users,
      teams,
      sessionUserId: authUserId,
      targetTeamId: clientTeamId,
    });
    if (!sw.ok) {
      if (sw.code === 'not_member') {
        return fail(res, 'Forbidden: not a member of this team.', 403);
      }
      if (sw.code === 'no_account') {
        return fail(res, 'Could not resolve account for workspace.', 400);
      }
      return fail(res, sw.message, 401);
    }
  }

  const wsCtx = await resolveWorkspaceContext(databases, authUserId, users);
  if (!wsCtx.authUserId) {
    return fail(res, 'Could not resolve account for workspace.', 400);
  }

  if (clientTeamId && (wsCtx.mode !== 'team' || wsCtx.rowTeamId !== clientTeamId)) {
    return fail(res, 'Forbidden: team workspace could not be activated.', 403);
  }

  const expectedSlugRaw = payload.wpSlug || payload.wp_slug;
  const expectedNorm = expectedSlugRaw ? normalizeWpSlug(String(expectedSlugRaw)) : '';

  let meta;
  try {
    meta = parseWordPressZip(buf, type, expectedNorm || undefined);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`[library] parse: ${msg}`);
    return fail(res, msg || 'Invalid ZIP.', 400);
  }

  const { name, version, slug, author } = meta;
  const safeVer = String(version).trim();
  const bucketId = bucketIdForLibraryType(type);
  const fileId = ID.unique();
  const zipName = safeZipFileName(payload, slug, safeVer);
  let uploadedBucketId = bucketId;
  let uploadedFileId = fileId;

  try {
    const inputFile = new File([buf], zipName);
    await storage.createFile(bucketId, fileId, inputFile);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error(`[library] storage createFile: ${msg}`);
    return fail(res, msg || 'Failed to upload to Appwrite storage.', 500);
  }

  const versionEntry = {
    source: 'local' as const,
    location: fileId,
    storageBucket: bucketId,
    isDefault: true,
  };

  const perms = workspaceDocumentPermissions(wsCtx.mode, authUserId, wsCtx.rowTeamId || '');
  const coll = libraryColl();
  const databaseId = dbId();

  try {
    const existing = await findExistingLibrary(databases, wsCtx, slug, type);

    if (existing) {
      let map = getOrBuildVersionsMap(existing);
      map[safeVer] = { ...versionEntry, isDefault: true };
      map = setDefaultVersionInMap(map, safeVer);
      map = ensureSingleDefaultInVersionMap(map);
      const mirror = mirrorLegacyFieldsFromVersions(map);
      const updated = await databases.updateDocument(databaseId, coll, String(existing.$id), {
        versions_json: serializeVersionsJson(map),
        version: mirror.version,
        source: mirror.source,
        is_default: mirror.is_default,
        name,
        author: author || 'Unknown',
        wpSlug: slug,
        s3_path: fileId,
      });
      return res.json(
        { success: true, message: `${name} has been added to your library.`, item: updated },
        200,
      );
    }

    const versions = { [safeVer]: { ...versionEntry } };
    const mirror = mirrorLegacyFieldsFromVersions(versions);
    const doc = {
      name,
      type,
      source: mirror.source,
      version: mirror.version,
      author: author || 'Unknown',
      ...ownerFields(wsCtx),
      wpSlug: slug,
      versions_json: serializeVersionsJson(versions),
      is_default: mirror.is_default,
      s3_path: fileId,
    };

    const created = await databases.createDocument(databaseId, coll, ID.unique(), doc, perms);
    return res.json(
      { success: true, message: `${name} has been added to your library.`, item: created },
      200,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    error(`[library] db: ${msg}`);
    try {
      await storage.deleteFile(uploadedBucketId, uploadedFileId);
    } catch {
      /* best-effort cleanup */
    }
    return fail(res, msg || 'Failed to save library item.', 500);
  }
}
