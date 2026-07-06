import { findLibraryItemsForInstalledPlugin } from '@/domains/sites/installedPluginLibraryMatch';
import { findLibraryItemsForInstalledTheme } from '@/domains/sites/installedThemeLibraryMatch';
import { formatAvailableUpdate, hasUpdate } from '@/domains/sites/installedMeta';
import type { LibraryItem, WordPressPlugin, WordPressTheme } from '@/types';

/** Positive when `a` is newer than `b`. */
export function compareSemverAsc(a: string, b: string): number {
  const pa = a.split('.').map((x) => {
    const n = parseInt(x, 10);
    return Number.isNaN(n) ? x : n;
  });
  const pb = b.split('.').map((x) => {
    const n = parseInt(x, 10);
    return Number.isNaN(n) ? x : n;
  });
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) {
      if (typeof x === 'number' && typeof y === 'number') return x - y;
      return String(x).localeCompare(String(y), undefined, { sensitivity: 'base' });
    }
  }
  return 0;
}

function resolveDefaultLibraryItem(items: LibraryItem[]): LibraryItem | null {
  if (items.length === 0) return null;
  return items.find((i) => i.isDefault === true) ?? items[0] ?? null;
}

function libraryTargetVersion(item: LibraryItem): string | null {
  const v = (item.version || '').trim();
  if (!v || v.toLowerCase() === 'latest') return null;
  return v;
}

export type LibraryExtensionUpdateTarget = {
  version: string;
  item: LibraryItem;
};

function getLibraryUpdateTarget(
  matches: LibraryItem[],
  installedVersion: string,
): LibraryExtensionUpdateTarget | null {
  const def = resolveDefaultLibraryItem(matches);
  if (!def) return null;
  const targetVersion = libraryTargetVersion(def);
  if (!targetVersion) return null;
  const installed = installedVersion.trim();
  if (!installed) return null;
  if (compareSemverAsc(targetVersion, installed) <= 0) return null;
  return { version: targetVersion, item: def };
}

export function getLibraryPluginUpdateTarget(
  libraryItems: LibraryItem[],
  plugin: WordPressPlugin,
): LibraryExtensionUpdateTarget | null {
  const matches = findLibraryItemsForInstalledPlugin(libraryItems, plugin);
  return getLibraryUpdateTarget(matches, plugin.version ?? '');
}

export function hasLibraryPluginUpdate(
  libraryItems: LibraryItem[],
  plugin: WordPressPlugin,
): boolean {
  return getLibraryPluginUpdateTarget(libraryItems, plugin) != null;
}

export function getLibraryThemeUpdateTarget(
  libraryItems: LibraryItem[],
  theme: WordPressTheme,
): LibraryExtensionUpdateTarget | null {
  const matches = findLibraryItemsForInstalledTheme(libraryItems, theme);
  return getLibraryUpdateTarget(matches, theme.version ?? '');
}

export function hasLibraryThemeUpdate(libraryItems: LibraryItem[], theme: WordPressTheme): boolean {
  return getLibraryThemeUpdateTarget(libraryItems, theme) != null;
}

/** Newer version label for the plugins table (bridge platform version handled separately). */
export function resolvePluginAvailableUpdateVersion(
  plugin: WordPressPlugin,
  libraryItems: LibraryItem[],
): string {
  if (hasUpdate(plugin)) return formatAvailableUpdate(plugin.update);
  const lib = getLibraryPluginUpdateTarget(libraryItems, plugin);
  return lib?.version ?? '—';
}

export function resolveThemeAvailableUpdateVersion(
  theme: WordPressTheme,
  libraryItems: LibraryItem[],
): string {
  if (hasUpdate(theme)) return formatAvailableUpdate(theme.update);
  const lib = getLibraryThemeUpdateTarget(libraryItems, theme);
  return lib?.version ?? '—';
}

export function pluginHasAvailableUpdate(
  plugin: WordPressPlugin,
  libraryItems: LibraryItem[],
): boolean {
  return hasUpdate(plugin) || hasLibraryPluginUpdate(libraryItems, plugin);
}

export function themeHasAvailableUpdate(theme: WordPressTheme, libraryItems: LibraryItem[]): boolean {
  return hasUpdate(theme) || hasLibraryThemeUpdate(libraryItems, theme);
}
