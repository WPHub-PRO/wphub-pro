import { decodeHtmlEntities } from '@/domains/library/libraryDashboardRows';
import { filterLibraryItemsBySlugAndType, getLibraryItemSlug } from '@/domains/library/libraryItemSlug';
import type { WpPluginInfo, WpThemeInfo } from '@/services/wordpress';
import type {
  InstallVersionOption,
  LibraryFamily,
  LibraryFamilyMemberPreference,
  LibraryItem,
  LibraryItemSource,
  LibraryItemType,
} from '@/types';

export type FamilyMemberKind = 'plugin' | 'theme' | 'ambiguous' | 'missing';

export type ResolvedFamilyMember =
  | {
      slug: string;
      kind: 'plugin' | 'theme';
      itemKind: LibraryItemType;
      items: LibraryItem[];
      displayName: string;
    }
  | {
      slug: string;
      kind: 'ambiguous';
      pluginItems: LibraryItem[];
      themeItems: LibraryItem[];
      displayName: string;
    }
  | {
      slug: string;
      kind: 'missing';
      displayName: string;
    };

function displayNameFromItems(items: LibraryItem[], slug: string): string {
  if (items.length === 0) return slug;
  const raw = items.find((i) => i.name?.trim())?.name ?? slug;
  return decodeHtmlEntities(String(raw || slug));
}

function itemsMatchingSlug(libraryItems: LibraryItem[], slug: string): {
  pluginItems: LibraryItem[];
  themeItems: LibraryItem[];
} {
  const s = slug.trim().toLowerCase();
  const pluginItems = libraryItems.filter(
    (i) => i.type === 'plugin' && getLibraryItemSlug(i) === s,
  );
  const themeItems = libraryItems.filter(
    (i) => i.type === 'theme' && getLibraryItemSlug(i) === s,
  );
  return { pluginItems, themeItems };
}

/** Resolve each family member slug against library items. */
export function resolveFamilyMembers(
  family: LibraryFamily,
  libraryItems: LibraryItem[],
): ResolvedFamilyMember[] {
  return family.memberSlugs.map((slug) => {
    const { pluginItems, themeItems } = itemsMatchingSlug(libraryItems, slug);
    if (pluginItems.length > 0 && themeItems.length > 0) {
      const name =
        displayNameFromItems(pluginItems, slug) !== slug
          ? displayNameFromItems(pluginItems, slug)
          : displayNameFromItems(themeItems, slug);
      return { slug, kind: 'ambiguous' as const, pluginItems, themeItems, displayName: name };
    }
    if (pluginItems.length > 0) {
      return {
        slug,
        kind: 'plugin' as const,
        itemKind: 'plugin' as const,
        items: pluginItems,
        displayName: displayNameFromItems(pluginItems, slug),
      };
    }
    if (themeItems.length > 0) {
      return {
        slug,
        kind: 'theme' as const,
        itemKind: 'theme' as const,
        items: themeItems,
        displayName: displayNameFromItems(themeItems, slug),
      };
    }
    return { slug, kind: 'missing' as const, displayName: slug };
  });
}

function sourceLabel(source: LibraryItemSource): string {
  if (source === 'official') return 'WordPress.org';
  if (source === 'local') return 'Uploaded';
  return 'Remote URL';
}

function versionShown(
  item: LibraryItem,
  itemKind: LibraryItemType,
  wpPluginInfo?: WpPluginInfo | null,
  wpThemeInfo?: WpThemeInfo | null,
): string {
  if (item.source === 'official' && item.version === 'latest') {
    if (itemKind === 'plugin') return wpPluginInfo?.version ?? 'latest';
    return wpThemeInfo?.version ?? 'latest';
  }
  return item.version || '—';
}

/**
 * Version options for family member install preference dropdowns.
 * `versionKey` is the library row `$id` (same as LibraryItemDetail install modal).
 */
export function buildInstallVersionOptions(
  items: LibraryItem[],
  itemKind: LibraryItemType,
  wpPluginInfo?: WpPluginInfo | null,
  wpThemeInfo?: WpThemeInfo | null,
): InstallVersionOption[] {
  return items.map((item) => {
    const shown = versionShown(item, itemKind, wpPluginInfo, wpThemeInfo);
    const key = item.$id;
    const label = `${shown} · ${sourceLabel(item.source)}${item.isDefault ? ' (default)' : ''}`;
    if (item.source === 'official') {
      const v =
        item.version === 'latest'
          ? (itemKind === 'plugin' ? wpPluginInfo?.version : wpThemeInfo?.version) ?? 'latest'
          : item.version;
      return {
        key,
        label,
        info: { source: 'official' as const, version: v || 'latest' },
      };
    }
    if (item.source === 'local') {
      return {
        key,
        label,
        info: { source: 'local' as const, version: item.version || shown },
      };
    }
    return {
      key,
      label,
      info: {
        source: 'remote' as const,
        version: item.version || shown,
        remoteUrl: item.remoteUrl ?? '',
      },
    };
  });
}

/** Pick the library row to install for a member (preference → default → first). */
export function pickLibraryItemForMember(
  items: LibraryItem[],
  preference?: LibraryFamilyMemberPreference,
): LibraryItem | null {
  if (items.length === 0) return null;
  if (preference?.versionKey) {
    const byKey = items.find((i) => i.$id === preference.versionKey);
    if (byKey) return byKey;
  }
  return items.find((i) => i.isDefault === true) ?? items[0] ?? null;
}

export function getResolvableMemberItems(member: ResolvedFamilyMember): LibraryItem[] {
  if (member.kind === 'plugin' || member.kind === 'theme') return member.items;
  return [];
}

export function getMemberItemKind(member: ResolvedFamilyMember): LibraryItemType | null {
  if (member.kind === 'plugin' || member.kind === 'theme') return member.itemKind;
  return null;
}

export function familyHasInstallBlockers(members: ResolvedFamilyMember[]): boolean {
  return members.some((m) => m.kind === 'missing' || m.kind === 'ambiguous');
}

export function familyMemberStats(members: ResolvedFamilyMember[]): {
  total: number;
  inLibrary: number;
  missing: number;
  ambiguous: number;
} {
  const total = members.length;
  const missing = members.filter((m) => m.kind === 'missing').length;
  const ambiguous = members.filter((m) => m.kind === 'ambiguous').length;
  const inLibrary = total - missing - ambiguous;
  return { total, inLibrary, missing, ambiguous };
}

export function filterLibraryItemsBySlugOnly(items: LibraryItem[], slug: string): LibraryItem[] {
  const s = slug.trim().toLowerCase();
  return items.filter((i) => getLibraryItemSlug(i) === s);
}

export { filterLibraryItemsBySlugAndType };
