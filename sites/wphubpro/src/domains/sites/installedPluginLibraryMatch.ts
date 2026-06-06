import { getPluginSlug } from '@/domains/library/libraryPluginGroups';
import { normalizeWpSlug } from '@/domains/library/libraryDocument';
import { pluginDirectorySlug } from '@/domains/sites/pluginUpdateFromSite';
import type { LibraryItem, WordPressPlugin } from '@/types';

function nameToSlugLike(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Lowercase + normalize variants used when matching installed plugins to library rows. */
function slugMatchVariants(raw: string): Set<string> {
  const out = new Set<string>();
  const t = raw.trim().toLowerCase();
  if (!t) return out;
  out.add(t);
  const normalized = normalizeWpSlug(t);
  if (normalized) out.add(normalized);
  return out;
}

function mergeSlugSets(...sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const s of sets) {
    for (const v of s) out.add(v);
  }
  return out;
}

function slugSetsOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const v of a) {
    if (b.has(v)) return true;
  }
  return false;
}

/** WordPress plugin directory slug from bridge `plugin` file path. */
export function getInstalledPluginWpSlug(plugin: WordPressPlugin): string {
  return normalizeWpSlug(pluginDirectorySlug(plugin.plugin));
}

function installedPluginMatchSlugs(plugin: WordPressPlugin): Set<string> {
  const dir = pluginDirectorySlug(plugin.plugin);
  const sets: Set<string>[] = [];
  if (dir) sets.push(slugMatchVariants(dir));
  if (plugin.name?.trim()) {
    sets.push(slugMatchVariants(plugin.name));
    sets.push(slugMatchVariants(nameToSlugLike(plugin.name)));
  }
  return mergeSlugSets(...sets);
}

function libraryPluginMatchSlugs(item: LibraryItem): Set<string> {
  const sets: Set<string>[] = [slugMatchVariants(getPluginSlug(item))];
  if (item.wpSlug?.trim()) sets.push(slugMatchVariants(item.wpSlug));
  if (item.name?.trim()) sets.push(slugMatchVariants(nameToSlugLike(item.name)));
  return mergeSlugSets(...sets);
}

export function findLibraryItemsForInstalledPlugin(
  libraryItems: LibraryItem[],
  plugin: WordPressPlugin,
): LibraryItem[] {
  const installed = installedPluginMatchSlugs(plugin);
  if (installed.size === 0) return [];
  return libraryItems.filter(
    (item) => item.type === 'plugin' && slugSetsOverlap(installed, libraryPluginMatchSlugs(item)),
  );
}

/** Slug segment for `/library/items/plugin/:slug` when a workspace library row exists. */
export function libraryDetailSlugForInstalledPlugin(
  libraryItems: LibraryItem[],
  plugin: WordPressPlugin,
): string | null {
  const matches = findLibraryItemsForInstalledPlugin(libraryItems, plugin);
  if (matches.length === 0) return null;
  return getPluginSlug(matches[0]).toLowerCase();
}

export function isInstalledPluginInLibrary(
  libraryItems: LibraryItem[],
  plugin: WordPressPlugin,
): boolean {
  return findLibraryItemsForInstalledPlugin(libraryItems, plugin).length > 0;
}
