import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Query } from 'appwrite';
import {
  APPWRITE_FUNCTION_IDS,
  COLLECTIONS,
  DATABASE_ID,
  databases,
  functions,
  ID,
} from '@/services/appwrite';
import { searchWpPlugins, searchWpThemes } from '@/services/wordpress';
import type { LibraryItem } from '@/types';
import { useNotificationContext } from '@/context/useNotificationContext';
import { useAuth } from '@/domains/auth';
import { useWorkspaceContext } from '@/domains/workspace';
import {
  libraryListFilters,
  workspaceDocumentPermissions,
  workspaceOwnerFields,
  type WorkspaceMode,
} from '@/domains/workspace/workspaceRowPermissions';
import {
  dedupeLibraryDocumentsForTeamWorkspace,
  decodeHtmlEntities,
  expandLibraryDocumentToItems,
  getOrBuildVersionsMap,
  mapLibraryDocumentToItem,
  mirrorLegacyFieldsFromVersions,
  normalizeWpSlug,
  parseCompositeLibraryItemId,
  serializeVersionsJson,
  setDefaultVersionInMap,
  ensureSingleDefaultInVersionMap,
} from '@/domains/library';
import { useAdminPersonalLibraryInAllWorkspaces } from '@/domains/library/libraryWorkspacePrefs';

import { LIBRARY_FUNCTION_ID } from '../api';

const LIBRARY_COLLECTION = COLLECTIONS.LIBRARY;

function docToFirstItem(doc: Record<string, unknown>): LibraryItem {
  return mapLibraryDocumentToItem(doc);
}

async function fetchLibraryDocByWpSlugAndType(
  mode: WorkspaceMode,
  userId: string,
  teamId: string | null,
  wpSlug: string,
  type: 'plugin' | 'theme',
  includePersonalLibraryInTeamWorkspace = false,
): Promise<Record<string, unknown> | null> {
  const normalized = normalizeWpSlug(wpSlug);
  const res = await databases.listDocuments(DATABASE_ID, LIBRARY_COLLECTION, [
    ...libraryListFilters(mode, userId, teamId, { includePersonalLibraryInTeamWorkspace }),
    Query.equal('wpSlug', normalized),
    Query.equal('type', type),
  ]);
  const docs = res.documents as Record<string, unknown>[];
  if (mode === 'team' && teamId && includePersonalLibraryInTeamWorkspace && docs.length > 1) {
    const deduped = dedupeLibraryDocumentsForTeamWorkspace(docs, teamId);
    return deduped[0] ?? null;
  }
  return docs[0] ?? null;
}

async function fetchLibraryPluginByWpSlug(
  mode: WorkspaceMode,
  userId: string,
  teamId: string | null,
  wpSlug: string,
  includePersonalLibraryInTeamWorkspace = false,
): Promise<Record<string, unknown> | null> {
  return fetchLibraryDocByWpSlugAndType(
    mode,
    userId,
    teamId,
    wpSlug,
    'plugin',
    includePersonalLibraryInTeamWorkspace,
  );
}

export const useLibraryItems = () => {
  const { user } = useAuth();
  const ws = useWorkspaceContext();
  const includePersonalLibrary = useAdminPersonalLibraryInAllWorkspaces();
  const libraryQuerySuffix =
    ws.mode === 'team' && includePersonalLibrary ? 'admin-personal-lib' : '';
  return useQuery({
    queryKey: ['libraryItems', user?.$id, ws.workspaceQueryKey, libraryQuerySuffix],
    queryFn: async () => {
      if (!user?.$id) return [];
      if (ws.mode === 'team' && !ws.activeTeamId) return [];
      const response = await databases.listDocuments(DATABASE_ID, LIBRARY_COLLECTION, [
        ...libraryListFilters(ws.mode, user.$id, ws.activeTeamId, {
          includePersonalLibraryInTeamWorkspace: includePersonalLibrary,
        }),
        Query.limit(500),
      ]);
      let docs = response.documents as Record<string, unknown>[];
      if (ws.mode === 'team' && ws.activeTeamId && includePersonalLibrary) {
        docs = dedupeLibraryDocumentsForTeamWorkspace(docs, ws.activeTeamId);
      }
      return docs.flatMap((doc) => expandLibraryDocumentToItems(doc));
    },
    enabled: !!user && (ws.mode !== 'team' || !!ws.activeTeamId),
  });
};

export const useSearchWpPlugins = (searchTerm: string, queryEnabled = true) => {
  return useQuery({
    queryKey: ['wpPluginsSearch', searchTerm],
    queryFn: () => searchWpPlugins(searchTerm),
    enabled: queryEnabled && !!searchTerm && searchTerm.length > 2,
    staleTime: 1000 * 60 * 10,
  });
};

export const useSearchWpThemes = (searchTerm: string, queryEnabled = true) => {
  return useQuery({
    queryKey: ['wpThemesSearch', searchTerm],
    queryFn: () => searchWpThemes(searchTerm),
    enabled: queryEnabled && !!searchTerm && searchTerm.length > 2,
    staleTime: 1000 * 60 * 10,
  });
};

export const useAddOfficialPlugin = () => {
  const queryClient = useQueryClient();
  const { showNotification } = useNotificationContext();
  const { user } = useAuth();
  const ws = useWorkspaceContext();
  const includePersonalLibrary = useAdminPersonalLibraryInAllWorkspaces();

  type AddOfficialVars = {
    name: string;
    slug: string;
    version: string;
    author: string;
    short_description?: string;
    prefillPluginSlug?: string;
    prefillPluginName?: string;
    __silent?: boolean;
  };

  return useMutation<LibraryItem, Error, AddOfficialVars>({
    mutationFn: async (plugin: AddOfficialVars) => {
      if (!user) throw new Error('User not authenticated.');
      if (ws.mode === 'team' && !ws.activeTeamId) throw new Error('No active team workspace.');
      const wpSlugRaw = plugin.prefillPluginSlug ?? plugin.slug;
      const wpSlug = normalizeWpSlug(wpSlugRaw);
      const name = decodeHtmlEntities(String(plugin.prefillPluginName ?? plugin.name ?? ''));
      const author = decodeHtmlEntities((plugin.author ?? '').replace(/<[^>]*>/g, '').trim());
      const description =
        decodeHtmlEntities((plugin.short_description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(
          0,
          10000,
        ) || undefined;
      const version = plugin.version ?? 'latest';

      const existing = await fetchLibraryPluginByWpSlug(
        ws.mode,
        user.$id,
        ws.activeTeamId,
        wpSlug,
        includePersonalLibrary,
      );

      if (existing) {
        let map = getOrBuildVersionsMap(existing);
        map[version] = { source: 'official', isDefault: true };
        map = setDefaultVersionInMap(map, version);
        map = ensureSingleDefaultInVersionMap(map);
        const mirror = mirrorLegacyFieldsFromVersions(map);
        const response = await databases.updateDocument(
          DATABASE_ID,
          LIBRARY_COLLECTION,
          String(existing.$id),
          {
            versions_json: serializeVersionsJson(map),
            version: mirror.version,
            source: mirror.source,
            is_default: mirror.is_default,
            name,
            author: author || 'Unknown',
            ...(description ? { description } : {}),
            wpSlug,
          },
        );
        return docToFirstItem(response as Record<string, unknown>);
      }

      const versions = { [version]: { source: 'official' as const, isDefault: true } };
      const mirror = mirrorLegacyFieldsFromVersions(versions);
      const docData: Record<string, unknown> = {
        name,
        type: 'plugin',
        source: mirror.source,
        version: mirror.version,
        author: author || 'Unknown',
        ...workspaceOwnerFields(ws.mode, user.$id, ws.activeTeamId),
        wpSlug,
        versions_json: serializeVersionsJson(versions),
        is_default: mirror.is_default,
        ...(description ? { description } : {}),
      };

      const response = await databases.createDocument(
        DATABASE_ID,
        LIBRARY_COLLECTION,
        ID.unique(),
        docData,
        workspaceDocumentPermissions(ws.mode, user.$id, ws.activeTeamId),
      );
      return docToFirstItem(response as Record<string, unknown>);
    },
    onSuccess: (data: LibraryItem, variables: AddOfficialVars) => {
      queryClient.invalidateQueries({ queryKey: ['libraryItems', user?.$id] });
      if (!variables?.__silent) {
        showNotification({
          title: 'Plugin added',
          message: `${data.name} has been added to your library.`,
          variant: 'success',
        });
      }
    },
    onError: (error: Error) => {
      showNotification({
        title: 'Error',
        message: `Failed to add plugin: ${error.message}`,
        variant: 'danger',
      });
    },
  });
};

export const useAddOfficialTheme = () => {
  const queryClient = useQueryClient();
  const { showNotification } = useNotificationContext();
  const { user } = useAuth();
  const ws = useWorkspaceContext();
  const includePersonalLibrary = useAdminPersonalLibraryInAllWorkspaces();

  type AddOfficialThemeVars = {
    name: string;
    slug: string;
    version: string;
    author: string;
    short_description?: string;
    prefillThemeSlug?: string;
    prefillThemeName?: string;
    __silent?: boolean;
  };

  return useMutation<LibraryItem, Error, AddOfficialThemeVars>({
    mutationFn: async (theme: AddOfficialThemeVars) => {
      if (!user) throw new Error('User not authenticated.');
      if (ws.mode === 'team' && !ws.activeTeamId) throw new Error('No active team workspace.');
      const wpSlugRaw = theme.prefillThemeSlug ?? theme.slug;
      const wpSlug = normalizeWpSlug(wpSlugRaw);
      const name = decodeHtmlEntities(String(theme.prefillThemeName ?? theme.name ?? ''));
      const author = decodeHtmlEntities((theme.author ?? '').replace(/<[^>]*>/g, '').trim());
      const description =
        decodeHtmlEntities((theme.short_description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(
          0,
          10000,
        ) || undefined;
      const version = theme.version ?? 'latest';

      const existing = await fetchLibraryDocByWpSlugAndType(
        ws.mode,
        user.$id,
        ws.activeTeamId,
        wpSlug,
        'theme',
        includePersonalLibrary,
      );

      if (existing) {
        let map = getOrBuildVersionsMap(existing);
        map[version] = { source: 'official', isDefault: true };
        map = setDefaultVersionInMap(map, version);
        map = ensureSingleDefaultInVersionMap(map);
        const mirror = mirrorLegacyFieldsFromVersions(map);
        const response = await databases.updateDocument(
          DATABASE_ID,
          LIBRARY_COLLECTION,
          String(existing.$id),
          {
            versions_json: serializeVersionsJson(map),
            version: mirror.version,
            source: mirror.source,
            is_default: mirror.is_default,
            name,
            author: author || 'Unknown',
            ...(description ? { description } : {}),
            wpSlug,
          },
        );
        return docToFirstItem(response as Record<string, unknown>);
      }

      const versions = { [version]: { source: 'official' as const, isDefault: true } };
      const mirror = mirrorLegacyFieldsFromVersions(versions);
      const docData: Record<string, unknown> = {
        name,
        type: 'theme',
        source: mirror.source,
        version: mirror.version,
        author: author || 'Unknown',
        ...workspaceOwnerFields(ws.mode, user.$id, ws.activeTeamId),
        wpSlug,
        versions_json: serializeVersionsJson(versions),
        is_default: mirror.is_default,
        ...(description ? { description } : {}),
      };

      const response = await databases.createDocument(
        DATABASE_ID,
        LIBRARY_COLLECTION,
        ID.unique(),
        docData,
        workspaceDocumentPermissions(ws.mode, user.$id, ws.activeTeamId),
      );
      return docToFirstItem(response as Record<string, unknown>);
    },
    onSuccess: (data: LibraryItem, variables: AddOfficialThemeVars) => {
      queryClient.invalidateQueries({ queryKey: ['libraryItems', user?.$id] });
      if (!variables?.__silent) {
        showNotification({
          title: 'Theme added',
          message: `${data.name} has been added to your library.`,
          variant: 'success',
        });
      }
    },
    onError: (error: Error) => {
      showNotification({
        title: 'Error',
        message: `Failed to add theme: ${error.message}`,
        variant: 'danger',
      });
    },
  });
};

export const useAddRemotePlugin = () => {
  const queryClient = useQueryClient();
  const { showNotification } = useNotificationContext();
  const { user } = useAuth();
  const ws = useWorkspaceContext();
  const includePersonalLibrary = useAdminPersonalLibraryInAllWorkspaces();

  type RemoteVars = {
    name: string;
    wpSlug: string;
    version: string;
    remoteUrl: string;
    author?: string;
    description?: string;
  };

  return useMutation<LibraryItem, Error, RemoteVars>({
    mutationFn: async ({
      name,
      wpSlug,
      version,
      remoteUrl,
      author = '',
      description = '',
    }: RemoteVars) => {
      if (!user) throw new Error('User not authenticated.');
      if (ws.mode === 'team' && !ws.activeTeamId) throw new Error('No active team workspace.');
      const url = remoteUrl.trim();
      if (!url.startsWith('https://')) {
        throw new Error('Remote URL must use HTTPS.');
      }
      const slug = normalizeWpSlug(wpSlug);
      const ver = version.trim() || '1.0.0';
      const existing = await fetchLibraryPluginByWpSlug(
        ws.mode,
        user.$id,
        ws.activeTeamId,
        slug,
        includePersonalLibrary,
      );

      if (existing) {
        let map = getOrBuildVersionsMap(existing);
        map[ver] = { source: 'remote', location: url, isDefault: true };
        map = setDefaultVersionInMap(map, ver);
        map = ensureSingleDefaultInVersionMap(map);
        const mirror = mirrorLegacyFieldsFromVersions(map);
        const response = await databases.updateDocument(
          DATABASE_ID,
          LIBRARY_COLLECTION,
          String(existing.$id),
          {
            versions_json: serializeVersionsJson(map),
            version: mirror.version,
            source: mirror.source,
            is_default: mirror.is_default,
            name: name.trim() || slug,
            author: author.replace(/<[^>]*>/g, '').trim() || 'Unknown',
            description: description.trim() || undefined,
            wpSlug: slug,
            remoteUrl: url,
          },
        );
        return docToFirstItem(response as Record<string, unknown>);
      }

      const versions = {
        [ver]: { source: 'remote' as const, location: url, isDefault: true },
      };
      const mirror = mirrorLegacyFieldsFromVersions(versions);
      const response = await databases.createDocument(
        DATABASE_ID,
        LIBRARY_COLLECTION,
        ID.unique(),
        {
          name: name.trim() || slug,
          type: 'plugin',
          source: mirror.source,
          version: mirror.version,
          author: author.replace(/<[^>]*>/g, '').trim() || 'Unknown',
          description: description.trim() || undefined,
          wpSlug: slug,
          remoteUrl: url,
          ...workspaceOwnerFields(ws.mode, user.$id, ws.activeTeamId),
          versions_json: serializeVersionsJson(versions),
          is_default: mirror.is_default,
        },
        workspaceDocumentPermissions(ws.mode, user.$id, ws.activeTeamId),
      );
      return docToFirstItem(response as Record<string, unknown>);
    },
    onSuccess: (data: LibraryItem) => {
      queryClient.invalidateQueries({ queryKey: ['libraryItems', user?.$id] });
      showNotification({
        title: 'Remote plugin added',
        message: `${data.name} has been added to your library.`,
        variant: 'success',
      });
    },
    onError: (error: Error) => {
      showNotification({
        title: 'Error',
        message: `Failed to add: ${error.message}`,
        variant: 'danger',
      });
    },
  });
};

type UploadLocalVars = { file: File; type: 'plugin' | 'theme'; wpSlug?: string };

export const useUploadLocalItem = () => {
  const queryClient = useQueryClient();
  const { showNotification } = useNotificationContext();
  const { user } = useAuth();
  const ws = useWorkspaceContext();

  return useMutation<{ success: boolean; message: string; item?: LibraryItem }, Error, UploadLocalVars>({
    mutationFn: async ({ file, type, wpSlug }: UploadLocalVars) => {
      if (!user) {
        throw new Error('User not authenticated.');
      }
      if (ws.mode === 'team' && !ws.activeTeamId) {
        throw new Error('No active team workspace.');
      }

      const readAsBase64 = (f: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve(reader.result as string);
          };
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });

      const base64 = await readAsBase64(file);

      const execution = await functions.createExecution(
        LIBRARY_FUNCTION_ID,
        JSON.stringify({
          action: 'add_local_item',
          type,
          fileBase64: base64,
          fileName: file.name,
          userId: user.$id,
          ...(wpSlug && { wpSlug }),
          ...(ws.mode === 'team' && ws.activeTeamId ? { teamId: ws.activeTeamId } : {}),
        }),
        false,
      );

      if (execution.responseStatusCode >= 400) {
        const errorBody = JSON.parse(execution.responseBody) as { message?: string };
        throw new Error(errorBody.message || 'Failed to process file.');
      }

      const parsed = JSON.parse(execution.responseBody) as {
        success?: boolean;
        message?: string;
        item?: Record<string, unknown>;
      };
      return {
        ...parsed,
        item: parsed?.item ? mapLibraryDocumentToItem(parsed.item) : undefined,
        success: !!parsed.success,
        message: String(parsed.message ?? ''),
      };
    },
    onSuccess: (data: { success: boolean; message: string; item?: LibraryItem }) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['libraryItems', user?.$id, ws.workspaceQueryKey] });
        showNotification({
          title: 'Upload successful',
          message: `${data.item?.name ?? 'Item'} has been added to your library.`,
          variant: 'success',
        });
      } else {
        showNotification({
          title: 'Upload failed',
          message: data.message,
          variant: 'danger',
        });
      }
    },
    onError: (error: Error) => {
      showNotification({
        title: 'Upload failed',
        message: error.message,
        variant: 'danger',
      });
    },
  });
};

export type PatchLibraryItemInput = {
  itemId: string;
  version?: string;
  tags?: string[];
  name?: string;
  wpSlug?: string;
  isDefault?: boolean;
  categoryId?: string | null;
  /** When set, updates `category_ids` and sets `category_id` to the first id (or null). */
  categoryIds?: string[] | null;
  isFavourite?: boolean;
};

export type SetLibraryDefaultVersionInput = {
  libraryDocumentId: string;
  versionKey: string;
  /** When true, skip success toast (e.g. before a bulk bridge install). */
  silent?: boolean;
};

/**
 * Sets which version in a library document is the default (used for installs and UI).
 * Updates `versions_json` and mirrored legacy fields on the document.
 */
export const useSetLibraryDefaultVersion = () => {
  const queryClient = useQueryClient();
  const { showNotification } = useNotificationContext();
  const { user } = useAuth();

  return useMutation<void, Error, SetLibraryDefaultVersionInput>({
    mutationFn: async ({ libraryDocumentId, versionKey }) => {
      const doc = await databases.getDocument(DATABASE_ID, LIBRARY_COLLECTION, libraryDocumentId);
      const map = getOrBuildVersionsMap(doc as Record<string, unknown>);
      if (!map[versionKey]) {
        throw new Error(`Version "${versionKey}" not found on this library document.`);
      }
      const newMap = ensureSingleDefaultInVersionMap(setDefaultVersionInMap(map, versionKey));
      const mirror = mirrorLegacyFieldsFromVersions(newMap);
      await databases.updateDocument(DATABASE_ID, LIBRARY_COLLECTION, libraryDocumentId, {
        versions_json: serializeVersionsJson(newMap),
        version: mirror.version,
        source: mirror.source,
        is_default: mirror.is_default,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['libraryItems', user?.$id] });
      if (!variables.silent) {
        showNotification({
          title: 'Default version updated',
          message: 'The bridge will use this build when installing from your library.',
          variant: 'success',
        });
      }
    },
    onError: (error: Error) => {
      showNotification({
        title: 'Could not set default version',
        message: error.message,
        variant: 'danger',
      });
    },
  });
};

export const usePatchLibraryItem = () => {
  const queryClient = useQueryClient();
  const { showNotification } = useNotificationContext();
  const { user } = useAuth();

  return useMutation<LibraryItem, Error, PatchLibraryItemInput>({
    mutationFn: async ({
      itemId,
      version,
      tags,
      name,
      wpSlug,
      isDefault,
      categoryId,
      categoryIds,
      isFavourite,
    }: PatchLibraryItemInput) => {
      const composite = parseCompositeLibraryItemId(itemId);
      const targetDocId = composite?.libraryDocumentId ?? itemId;
      const patch: Record<string, unknown> = {};
      if (version !== undefined) patch.version = version;
      if (tags !== undefined) patch.tags = tags;
      if (name !== undefined) patch.name = name;
      if (wpSlug !== undefined) patch.wpSlug = wpSlug;
      if (isDefault !== undefined) patch.is_default = isDefault;
      if (categoryIds !== undefined) {
        const raw = categoryIds == null ? [] : categoryIds;
        const uniq = [...new Set(raw.map((id) => String(id).trim()).filter(Boolean))];
        patch.category_ids = uniq.length > 0 ? uniq : null;
        patch.category_id = uniq[0] ?? null;
      } else if (categoryId !== undefined) {
        const id = categoryId === null || categoryId === '' ? null : String(categoryId).trim();
        patch.category_id = id;
        patch.category_ids = id ? [id] : null;
      }
      if (isFavourite !== undefined) patch.is_favourite = isFavourite;
      if (Object.keys(patch).length === 0) {
        throw new Error('Nothing to update');
      }
      const response = await databases.updateDocument(
        DATABASE_ID,
        LIBRARY_COLLECTION,
        targetDocId,
        patch,
      );
      return docToFirstItem(response as Record<string, unknown>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryItems', user?.$id] });
    },
    onError: (error: Error) => {
      showNotification({
        title: 'Error',
        message: `Failed to save: ${error.message}`,
        variant: 'danger',
      });
    },
  });
};

export const useDeleteLibraryItem = () => {
  const queryClient = useQueryClient();
  const { showNotification } = useNotificationContext();
  const { user } = useAuth();

  return useMutation<void, Error, string>({
    mutationFn: async (itemId: string) => {
      const composite = parseCompositeLibraryItemId(itemId);
      if (composite) {
        const doc = (await databases.getDocument(
          DATABASE_ID,
          LIBRARY_COLLECTION,
          composite.libraryDocumentId,
        )) as unknown as Record<string, unknown>;
        const versions = getOrBuildVersionsMap(doc);
        if (!versions[composite.versionKey]) {
          throw new Error('Version not found');
        }
        const next = { ...versions };
        delete next[composite.versionKey];
        const keys = Object.keys(next);
        if (keys.length === 0) {
          await databases.deleteDocument(DATABASE_ID, LIBRARY_COLLECTION, composite.libraryDocumentId);
          return;
        }
        const removedWasDefault = versions[composite.versionKey]?.isDefault === true;
        const final = removedWasDefault ? setDefaultVersionInMap(next, keys[0]) : next;
        const legacy = mirrorLegacyFieldsFromVersions(final);
        await databases.updateDocument(DATABASE_ID, LIBRARY_COLLECTION, composite.libraryDocumentId, {
          versions_json: serializeVersionsJson(final),
          version: legacy.version,
          source: legacy.source,
          is_default: legacy.is_default,
        });
        return;
      }
      await databases.deleteDocument(DATABASE_ID, LIBRARY_COLLECTION, itemId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryItems', user?.$id] });
      showNotification({
        title: 'Removed',
        message: 'Item has been removed from your library.',
        variant: 'success',
      });
    },
    onError: (error: Error) => {
      showNotification({
        title: 'Error',
        message: `Failed to remove: ${error.message}`,
        variant: 'danger',
      });
    },
  });
};
