import { getThemeGroupKey } from '@/domains/library/libraryPluginGroups';
import { normalizeWpSlug } from '@/domains/library/libraryDocument';
import type { LibraryItem, WordPressTheme } from '@/types';

function nameToSlugLike(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

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

export function getInstalledThemeWpSlug(theme: WordPressTheme): string {
  return normalizeWpSlug(theme.stylesheet);
}

function installedThemeMatchSlugs(theme: WordPressTheme): Set<string> {
  const sets: Set<string>[] = [];
  if (theme.stylesheet?.trim()) sets.push(slugMatchVariants(theme.stylesheet));
  if (theme.name?.trim()) {
    sets.push(slugMatchVariants(theme.name));
    sets.push(slugMatchVariants(nameToSlugLike(theme.name)));
  }
  return mergeSlugSets(...sets);
}

function libraryThemeMatchSlugs(item: LibraryItem): Set<string> {
  const sets: Set<string>[] = [slugMatchVariants(getThemeGroupKey(item))];
  if (item.wpSlug?.trim()) sets.push(slugMatchVariants(item.wpSlug));
  if (item.name?.trim()) sets.push(slugMatchVariants(nameToSlugLike(item.name)));
  return mergeSlugSets(...sets);
}

export function findLibraryItemsForInstalledTheme(
  libraryItems: LibraryItem[],
  theme: WordPressTheme,
): LibraryItem[] {
  const installed = installedThemeMatchSlugs(theme);
  if (installed.size === 0) return [];
  return libraryItems.filter(
    (item) => item.type === 'theme' && slugSetsOverlap(installed, libraryThemeMatchSlugs(item)),
  );
}
