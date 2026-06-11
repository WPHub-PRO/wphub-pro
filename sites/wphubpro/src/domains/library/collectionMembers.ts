import { decodeHtmlEntities } from '@/domains/library/libraryDashboardRows';
import {
  buildInstallVersionOptions,
  pickLibraryItemForMember,
} from '@/domains/library/familyMembers';
import { filterLibraryItemsBySlugAndType } from '@/domains/library/libraryItemSlug';
import type {
  LibraryCollection,
  LibraryCollectionMember,
  LibraryItem,
  LibraryItemType,
} from '@/types';

export type ResolvedCollectionMember =
  | {
      member: LibraryCollectionMember;
      slug: string;
      type: LibraryItemType;
      kind: 'resolved';
      items: LibraryItem[];
      displayName: string;
    }
  | {
      member: LibraryCollectionMember;
      slug: string;
      type: LibraryItemType;
      kind: 'missing';
      displayName: string;
    };

export function memberRowKey(member: LibraryCollectionMember): string {
  return `${member.slug}:${member.type}`;
}

function displayNameFromItems(items: LibraryItem[], slug: string): string {
  if (items.length === 0) return slug;
  const raw = items.find((i) => i.name?.trim())?.name ?? slug;
  return decodeHtmlEntities(String(raw || slug));
}

/** Resolve each collection item against library rows (slug + type). */
export function resolveCollectionMembers(
  collection: LibraryCollection,
  libraryItems: LibraryItem[],
): ResolvedCollectionMember[] {
  return collection.items.map((member) => {
    const slug = member.slug.trim().toLowerCase();
    const items = filterLibraryItemsBySlugAndType(libraryItems, slug, member.type);
    if (items.length > 0) {
      return {
        member,
        slug,
        type: member.type,
        kind: 'resolved' as const,
        items,
        displayName: displayNameFromItems(items, slug),
      };
    }
    return {
      member,
      slug,
      type: member.type,
      kind: 'missing' as const,
      displayName: slug,
    };
  });
}

/** Pick library row for install: manual versionKey when set, else library default. */
export function pickLibraryItemForCollectionMember(
  items: LibraryItem[],
  member: LibraryCollectionMember,
): LibraryItem | null {
  if (items.length === 0) return null;
  if (member.versionMode === 'manual' && member.manualVersionKey) {
    const byKey = items.find((i) => i.$id === member.manualVersionKey);
    if (byKey) return byKey;
  }
  return pickLibraryItemForMember(items);
}

export function collectionHasInstallBlockers(members: ResolvedCollectionMember[]): boolean {
  return members.some((m) => m.kind === 'missing');
}

export function collectionMemberStats(members: ResolvedCollectionMember[]): {
  total: number;
  inLibrary: number;
  missing: number;
} {
  const total = members.length;
  const missing = members.filter((m) => m.kind === 'missing').length;
  return { total, inLibrary: total - missing, missing };
}

export function updateCollectionMemberInList(
  items: LibraryCollectionMember[],
  rowKey: string,
  patch: Partial<LibraryCollectionMember>,
): LibraryCollectionMember[] {
  return items.map((m) => (memberRowKey(m) === rowKey ? { ...m, ...patch } : m));
}

export function removeCollectionMemberFromList(
  items: LibraryCollectionMember[],
  rowKey: string,
): LibraryCollectionMember[] {
  return items.filter((m) => memberRowKey(m) !== rowKey);
}

export { buildInstallVersionOptions };
