import { ROUTE_PATHS } from '@/config/routePaths';
import { libraryDetailSlugForInstalledPlugin } from '@/domains/sites/installedPluginLibraryMatch';
import { useLibraryItems } from '@/hooks/useLibrary';
import type { WordPressPlugin } from '@/types';
import { useCallback } from 'react';
import { useNavigate } from 'react-router';

/**
 * Resolves installed site plugin clicks against the active workspace library.
 * In library → library item detail; otherwise → site plugin detail (add-to-library UI).
 */
export function useSiteInstalledPluginNavigation(siteId: string | undefined) {
  const navigate = useNavigate();
  const { data: libraryItems = [] } = useLibraryItems();

  const onPluginClick = useCallback(
    (plugin: WordPressPlugin, event?: { preventDefault?: () => void; metaKey?: boolean; ctrlKey?: boolean }) => {
      if (!siteId || !plugin.plugin?.trim()) return;
      event?.preventDefault?.();

      const libSlug = libraryDetailSlugForInstalledPlugin(libraryItems, plugin);
      const path = libSlug
        ? ROUTE_PATHS.libraryItemDetailPath('plugin', libSlug)
        : ROUTE_PATHS.sitePluginDetailPath(siteId, plugin.plugin);

      if (event?.metaKey || event?.ctrlKey) {
        window.open(path, '_blank', 'noopener,noreferrer');
        return;
      }
      navigate(path);
    },
    [libraryItems, navigate, siteId],
  );

  const getPluginDetailPath = useCallback(
    (plugin: WordPressPlugin): string | null => {
      if (!siteId || !plugin.plugin?.trim()) return null;
      const libSlug = libraryDetailSlugForInstalledPlugin(libraryItems, plugin);
      return libSlug
        ? ROUTE_PATHS.libraryItemDetailPath('plugin', libSlug)
        : ROUTE_PATHS.sitePluginDetailPath(siteId, plugin.plugin);
    },
    [libraryItems, siteId],
  );

  return { onPluginClick, getPluginDetailPath, libraryItems };
}
