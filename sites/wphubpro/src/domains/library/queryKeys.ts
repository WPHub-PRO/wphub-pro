export const libraryItemsQueryKey = (
  userId: string,
  workspaceKey: string,
  suffix: string,
) => ['libraryItems', userId, workspaceKey, suffix] as const;
