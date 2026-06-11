import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { databases, DATABASE_ID, COLLECTIONS, ID } from '@/services/appwrite';
import { useAuth } from '@/domains/auth';
import { useWorkspaceContext } from '@/domains/workspace';
import { useAdminPersonalLibraryInAllWorkspaces } from '@/domains/library/libraryWorkspacePrefs';
import {
  libraryListFilters,
  workspaceDocumentPermissions,
  workspaceOwnerFields,
} from '@/domains/workspace/workspaceRowPermissions';
import {
  mapLibraryCollectionDocument,
  mapLibraryFamilyDocument,
  serializeLibraryCollectionItems,
  serializeMemberPreferencesJson,
} from '@/domains/library';
import { useNotificationContext } from '@/context/useNotificationContext';
import type {
  LibraryCollection,
  LibraryCollectionMember,
  LibraryFamily,
  LibraryFamilyMemberPreference,
} from '@/types';

const famCol = COLLECTIONS.LIBRARY_FAMILIES;
const collCol = COLLECTIONS.LIBRARY_COLLECTIONS;

export const useLibraryFamilies = () => {
  const { user } = useAuth();
  const ws = useWorkspaceContext();
  const includePersonalLibrary = useAdminPersonalLibraryInAllWorkspaces();
  const libraryQuerySuffix =
    ws.mode === 'team' && includePersonalLibrary ? 'admin-personal-lib' : '';
  return useQuery<LibraryFamily[], Error>({
    queryKey: ['libraryFamilies', user?.$id, ws.workspaceQueryKey, libraryQuerySuffix],
    queryFn: async () => {
      if (!user?.$id) return [];
      if (ws.mode === 'team' && !ws.activeTeamId) return [];
      const response = await databases.listDocuments(DATABASE_ID, famCol, [
        ...libraryListFilters(ws.mode, user.$id, ws.activeTeamId, {
          includePersonalLibraryInTeamWorkspace: includePersonalLibrary,
        }),
      ]);
      return response.documents.map((doc) => mapLibraryFamilyDocument(doc as Record<string, unknown>));
    },
    enabled: !!user && (ws.mode !== 'team' || !!ws.activeTeamId),
  });
};

export const useLibraryCollections = () => {
  const { user } = useAuth();
  const ws = useWorkspaceContext();
  const includePersonalLibrary = useAdminPersonalLibraryInAllWorkspaces();
  const libraryQuerySuffix =
    ws.mode === 'team' && includePersonalLibrary ? 'admin-personal-lib' : '';
  return useQuery<LibraryCollection[], Error>({
    queryKey: ['libraryCollections', user?.$id, ws.workspaceQueryKey, libraryQuerySuffix],
    queryFn: async () => {
      if (!user?.$id) return [];
      if (ws.mode === 'team' && !ws.activeTeamId) return [];
      const response = await databases.listDocuments(DATABASE_ID, collCol, [
        ...libraryListFilters(ws.mode, user.$id, ws.activeTeamId, {
          includePersonalLibraryInTeamWorkspace: includePersonalLibrary,
        }),
      ]);
      return response.documents.map((doc) => mapLibraryCollectionDocument(doc as Record<string, unknown>));
    },
    enabled: !!user && (ws.mode !== 'team' || !!ws.activeTeamId),
  });
};

export const useUpdateLibraryFamilyName = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showNotification } = useNotificationContext();

  return useMutation<void, Error, { familyId: string; name: string }>({
    mutationFn: async ({ familyId, name }) => {
      const trimmed = name.trim();
      await databases.updateDocument(DATABASE_ID, famCol, familyId, {
        name: trimmed || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryFamilies', user?.$id] });
    },
    onError: (e: Error) => {
      showNotification({ title: 'Family', message: e.message, variant: 'danger' });
    },
  });
};

export const useUpdateLibraryFamilyMemberPreferences = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showNotification } = useNotificationContext();

  return useMutation<
    void,
    Error,
    { familyId: string; memberPreferences: Record<string, LibraryFamilyMemberPreference> }
  >({
    mutationFn: async ({ familyId, memberPreferences }) => {
      await databases.updateDocument(DATABASE_ID, famCol, familyId, {
        member_preferences_json: serializeMemberPreferencesJson(memberPreferences),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryFamilies', user?.$id] });
    },
    onError: (e: Error) => {
      showNotification({ title: 'Family', message: e.message, variant: 'danger' });
    },
  });
};

export const useDeleteLibraryFamily = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showNotification } = useNotificationContext();

  return useMutation<void, Error, { familyId: string }>({
    mutationFn: async ({ familyId }) => {
      await databases.deleteDocument(DATABASE_ID, famCol, familyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryFamilies', user?.$id] });
      showNotification({ title: 'Family', message: 'Family deleted.', variant: 'success' });
    },
    onError: (e: Error) => {
      showNotification({ title: 'Family', message: e.message, variant: 'danger' });
    },
  });
};

export const useUpdateLibraryFamilyMemberSlugs = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showNotification } = useNotificationContext();

  return useMutation<void, Error, { familyId: string; memberSlugs: string[] }>({
    mutationFn: async ({ familyId, memberSlugs }) => {
      const unique = [...new Set(memberSlugs.map((s) => s.trim().toLowerCase()).filter(Boolean))];
      await databases.updateDocument(DATABASE_ID, famCol, familyId, { member_slugs: unique });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryFamilies', user?.$id] });
    },
    onError: (e: Error) => {
      showNotification({ title: 'Family', message: e.message, variant: 'danger' });
    },
  });
};

export const useCreateLibraryFamily = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const ws = useWorkspaceContext();
  const { showNotification } = useNotificationContext();

  return useMutation<void, Error, { name?: string; memberSlugs: string[] }>({
    mutationFn: async ({ name, memberSlugs }) => {
      if (!user?.$id) throw new Error('Not signed in');
      if (ws.mode === 'team' && !ws.activeTeamId) throw new Error('No active team workspace.');
      const slugs = [...new Set(memberSlugs.map((s) => s.trim().toLowerCase()).filter(Boolean))];
      if (slugs.length === 0) throw new Error('At least one member slug is required');
      await databases.createDocument(
        DATABASE_ID,
        famCol,
        ID.unique(),
        {
          ...workspaceOwnerFields(ws.mode, user.$id, ws.activeTeamId),
          member_slugs: slugs,
          ...(name?.trim() ? { name: name.trim() } : {}),
        },
        workspaceDocumentPermissions(ws.mode, user.$id, ws.activeTeamId),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryFamilies', user?.$id] });
      showNotification({ title: 'Family', message: 'Family created.', variant: 'success' });
    },
    onError: (e: Error) => {
      showNotification({ title: 'Family', message: e.message, variant: 'danger' });
    },
  });
};

export const useUpdateLibraryCollectionItems = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showNotification } = useNotificationContext();

  return useMutation<void, Error, { collectionId: string; items: LibraryCollectionMember[] }>({
    mutationFn: async ({ collectionId, items }) => {
      await databases.updateDocument(DATABASE_ID, collCol, collectionId, {
        items_json: serializeLibraryCollectionItems(items),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryCollections', user?.$id] });
    },
    onError: (e: Error) => {
      showNotification({ title: 'Collection', message: e.message, variant: 'danger' });
    },
  });
};

export const useCreateLibraryCollection = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const ws = useWorkspaceContext();
  const { showNotification } = useNotificationContext();

  return useMutation<void, Error, { name: string; items: LibraryCollectionMember[] }>({
    mutationFn: async ({ name, items }) => {
      if (!user?.$id) throw new Error('Not signed in');
      if (ws.mode === 'team' && !ws.activeTeamId) throw new Error('No active team workspace.');
      const n = name.trim();
      if (!n) throw new Error('Name is required');
      if (items.length === 0) throw new Error('Add at least one item');
      await databases.createDocument(
        DATABASE_ID,
        collCol,
        ID.unique(),
        {
          ...workspaceOwnerFields(ws.mode, user.$id, ws.activeTeamId),
          name: n,
          items_json: serializeLibraryCollectionItems(items),
        },
        workspaceDocumentPermissions(ws.mode, user.$id, ws.activeTeamId),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['libraryCollections', user?.$id] });
      showNotification({ title: 'Collection', message: 'Collection created.', variant: 'success' });
    },
    onError: (e: Error) => {
      showNotification({ title: 'Collection', message: e.message, variant: 'danger' });
    },
  });
};
