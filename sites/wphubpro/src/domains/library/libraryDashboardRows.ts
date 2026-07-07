import type { LibraryItem } from '@/types';
import { getLibraryItemSlug } from './libraryItemSlug';
import { getItemsForGrouping, getPluginGroups } from './libraryPluginGroups';

function decodeHtmlEntitiesFallback(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, '\u00A0');
}

export function decodeHtmlEntities(text: string): string {
  if (!text) return '';
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea');
    el.innerHTML = text;
    return el.value;
  }
  return decodeHtmlEntitiesFallback(text);
}

function tagsForGroup(group: { items: LibraryItem[] }): string[] {
  const s = new Set<string>();
  group.items.forEach((i) =>
    (i.tags ?? []).forEach((t) => {
      const x = String(t).trim();
      if (x) s.add(x);
    }),
  );
  return Array.from(s).sort((a, b) => a.localeCompare(b));
}

function tagsForThemeItem(item: LibraryItem): string[] {
  return (item.tags ?? [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function compareSemverDesc(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return y - x;
  }
  return 0;
}

function pickDefaultLibraryItem(items: LibraryItem[]): LibraryItem | undefined {
  if (items.length === 0) return undefined;
  return items.find((i) => i.isDefault === true) ?? items[0];
}

export type LibraryWpVersionMap = {
  plugins: Record<string, string | undefined>;
  themes: Record<string, string | undefined>;
};

const EMPTY_WP_VERSIONS: LibraryWpVersionMap = { plugins: {}, themes: {} };

function resolveItemVersion(
  item: LibraryItem,
  itemKind: 'plugin' | 'theme',
  wpVersions: LibraryWpVersionMap,
): string {
  const raw = item.version?.trim() ?? '';
  if (!raw) return '';
  if (item.source === 'official' && raw === 'latest') {
    const slug = getLibraryItemSlug(item).toLowerCase();
    const resolved =
      itemKind === 'plugin' ? wpVersions.plugins[slug] : wpVersions.themes[slug];
    return resolved?.trim() || raw;
  }
  return raw;
}

function highestKnownVersion(
  items: LibraryItem[],
  itemKind: 'plugin' | 'theme',
  wpVersions: LibraryWpVersionMap,
): string | undefined {
  const versions = items
    .map((i) => resolveItemVersion(i, itemKind, wpVersions))
    .filter((v): v is string => !!v && v !== 'latest');
  if (versions.length === 0) return undefined;
  return [...new Set(versions)].sort(compareSemverDesc)[0];
}

function isLatestVersionInGroup(
  item: LibraryItem,
  items: LibraryItem[],
  itemKind: 'plugin' | 'theme',
  wpVersions: LibraryWpVersionMap,
): boolean {
  const raw = item.version?.trim() ?? '';
  if (raw === 'latest') return true;
  const version = resolveItemVersion(item, itemKind, wpVersions);
  const highest = highestKnownVersion(items, itemKind, wpVersions);
  if (!highest || !version || version === 'latest') return false;
  return compareSemverDesc(version, highest) === 0;
}

function buildVersionLabelForItem(
  item: LibraryItem,
  groupItems: LibraryItem[],
  itemKind: 'plugin' | 'theme',
  wpVersions: LibraryWpVersionMap,
): string {
  const resolved = resolveItemVersion(item, itemKind, wpVersions);
  if (!resolved) return '—';
  if (isLatestVersionInGroup(item, groupItems, itemKind, wpVersions)) {
    return `${resolved} (latest)`;
  }
  return resolved;
}

function buildDefaultVersionLabel(
  items: LibraryItem[],
  itemKind: 'plugin' | 'theme',
  wpVersions: LibraryWpVersionMap,
): string {
  const defaultItem = pickDefaultLibraryItem(items);
  if (!defaultItem) return '—';
  return buildVersionLabelForItem(defaultItem, items, itemKind, wpVersions);
}

/** Flat list row aligned with wphubpro Library page “Library items” table (plugin groups + theme rows). */
export type LibraryDashboardRow = {
  id: string;
  kind: 'plugin' | 'theme';
  name: string;
  tags: string[];
  versionLabel: string;
  author: string;
  /** Appwrite `library` document id for patch/delete/favourite/category. */
  libraryDocumentId: string;
  /** Lowercased slug for `/library/items/:kind/:slug` routes. */
  routeSlug: string;
  categoryId?: string;
  /** All assigned folder categories (for filters / counts). */
  categoryIds?: string[];
  categoryName?: string;
  isFavourite: boolean;
  /** True if any version uses local (uploaded) source. */
  hasLocalVersion: boolean;
};

export function buildLibraryDashboardRows(
  libraryItems: LibraryItem[],
  categoryNameById: Record<string, string> = {},
  wpVersions: LibraryWpVersionMap = EMPTY_WP_VERSIONS,
): LibraryDashboardRow[] {
  const pluginItems = libraryItems.filter((i) => i.type === 'plugin');
  const themeItems = libraryItems.filter((i) => i.type === 'theme');
  const pluginGroups = getPluginGroups(pluginItems);
  const rows: LibraryDashboardRow[] = [];

  for (const g of pluginGroups) {
    const first = pickDefaultLibraryItem(g.items) ?? g.items[0];
    const versionLabel = buildDefaultVersionLabel(g.items, 'plugin', wpVersions);
    const libraryDocumentId = first?.libraryDocumentId ?? parseThemeDocId(first?.$id ?? '');
    const routeSlug = getLibraryItemSlug(first!).toLowerCase();
    const categoryIds =
      first?.categoryIds?.length ? first.categoryIds : first?.categoryId ? [first.categoryId] : [];
    const categoryId = categoryIds[0];
    const categoryName =
      categoryIds.length > 0
        ? categoryIds.map((id) => categoryNameById[id]).filter(Boolean).join(', ') || undefined
        : undefined;
    const isFavourite = !!first?.isFavourite;
    const hasLocalVersion = g.items.some((i) => i.source === 'local');
    rows.push({
      id: `plugin:${g.slug}`,
      kind: 'plugin',
      name: decodeHtmlEntities(g.displayName),
      tags: tagsForGroup(g),
      versionLabel,
      author: first?.author || '—',
      libraryDocumentId,
      routeSlug,
      ...(categoryIds.length > 0 ? { categoryIds, categoryId } : {}),
      ...(categoryName ? { categoryName } : {}),
      isFavourite,
      hasLocalVersion,
    });
  }

  for (const item of themeItems) {
    const themeGroupItems = getItemsForGrouping(item, themeItems);
    const libraryDocumentId = item.libraryDocumentId ?? parseThemeDocId(item.$id);
    const routeSlug = getLibraryItemSlug(item).toLowerCase();
    const categoryIds =
      item.categoryIds?.length ? item.categoryIds : item.categoryId ? [item.categoryId] : [];
    const categoryId = categoryIds[0];
    const categoryName =
      categoryIds.length > 0
        ? categoryIds.map((id) => categoryNameById[id]).filter(Boolean).join(', ') || undefined
        : undefined;
    rows.push({
      id: `theme:${item.$id}`,
      kind: 'theme',
      name: decodeHtmlEntities(item.name),
      tags: tagsForThemeItem(item),
      versionLabel: buildVersionLabelForItem(item, themeGroupItems, 'theme', wpVersions),
      author: item.author || '—',
      libraryDocumentId,
      routeSlug,
      ...(categoryIds.length > 0 ? { categoryIds, categoryId } : {}),
      ...(categoryName ? { categoryName } : {}),
      isFavourite: !!item.isFavourite,
      hasLocalVersion: item.source === 'local',
    });
  }

  return rows;
}

function parseThemeDocId(itemId: string): string {
  const sep = '::';
  const idx = itemId.indexOf(sep);
  return idx > 0 ? itemId.slice(0, idx) : itemId;
}
