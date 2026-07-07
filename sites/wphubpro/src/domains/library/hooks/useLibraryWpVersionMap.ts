import { getLibraryItemSlug } from '@/domains/library/libraryItemSlug';
import type { LibraryWpVersionMap } from '@/domains/library/libraryDashboardRows';
import { getWpPluginInfo, getWpThemeInfo } from '@/services/wordpress';
import type { LibraryItem } from '@/types';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

export function collectLibraryWpVersionSlugs(libraryItems: LibraryItem[]): {
  pluginSlugs: string[];
  themeSlugs: string[];
} {
  const pluginSet = new Set<string>();
  const themeSet = new Set<string>();
  for (const item of libraryItems) {
    if (item.source !== 'official' || item.version?.trim() !== 'latest') continue;
    const slug = getLibraryItemSlug(item).toLowerCase();
    if (item.type === 'plugin') pluginSet.add(slug);
    else themeSet.add(slug);
  }
  return {
    pluginSlugs: [...pluginSet],
    themeSlugs: [...themeSet],
  };
}

/** Resolve WordPress.org `latest` pins to concrete semver for library list labels. */
export function useLibraryWpVersionMap(libraryItems: LibraryItem[]): LibraryWpVersionMap {
  const { pluginSlugs, themeSlugs } = useMemo(
    () => collectLibraryWpVersionSlugs(libraryItems),
    [libraryItems],
  );

  const wpPluginQueries = useQueries({
    queries: pluginSlugs.map((slug) => ({
      queryKey: ['wpPluginInfo', slug],
      queryFn: () => getWpPluginInfo(slug),
      staleTime: 1000 * 60 * 10,
    })),
  });

  const wpThemeQueries = useQueries({
    queries: themeSlugs.map((slug) => ({
      queryKey: ['wpThemeInfo', slug],
      queryFn: () => getWpThemeInfo(slug),
      staleTime: 1000 * 60 * 10,
    })),
  });

  return useMemo(() => {
    const plugins: Record<string, string | undefined> = {};
    const themes: Record<string, string | undefined> = {};
    pluginSlugs.forEach((slug, i) => {
      const version = wpPluginQueries[i]?.data?.version?.trim();
      if (version) plugins[slug] = version;
    });
    themeSlugs.forEach((slug, i) => {
      const version = wpThemeQueries[i]?.data?.version?.trim();
      if (version) themes[slug] = version;
    });
    return { plugins, themes };
  }, [pluginSlugs, themeSlugs, wpPluginQueries, wpThemeQueries]);
}
