import {
  pickLibraryItemForCollectionMember,
  resolveCollectionMembers,
  type ResolvedCollectionMember,
} from '@/domains/library/collectionMembers';
import {
  planLibraryBridgeInstall,
  runLibraryBridgeInstallOnSite,
  type LibraryBridgeInstallPlan,
} from '@/domains/library/libraryBridgeInstall';
import type { WpPluginInfo, WpThemeInfo } from '@/services/wordpress';
import type { LibraryCollection, LibraryItem, LibraryItemType } from '@/types';

export type CollectionInstallLineResult = {
  siteId: string;
  slug: string;
  type: LibraryItemType;
  ok: boolean;
  message: string;
};

export type CollectionInstallWpInfoMap = {
  plugins: Record<string, WpPluginInfo | null | undefined>;
  themes: Record<string, WpThemeInfo | null | undefined>;
};

export type CollectionInstallValidation =
  | { ok: true; members: ResolvedCollectionMember[] }
  | { ok: false; message: string };

export function validateCollectionForInstall(
  collection: LibraryCollection,
  libraryItems: LibraryItem[],
): CollectionInstallValidation {
  const members = resolveCollectionMembers(collection, libraryItems);
  if (members.length === 0) {
    return { ok: false, message: 'This collection has no items yet.' };
  }
  const missing = members.filter((m) => m.kind === 'missing');
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Not in library: ${missing.map((m) => `${m.slug} (${m.type})`).join(', ')}.`,
    };
  }
  return { ok: true, members };
}

function planForCollectionMember(
  resolved: ResolvedCollectionMember,
  wpInfo: CollectionInstallWpInfoMap,
): { item: LibraryItem; plan: LibraryBridgeInstallPlan } | null {
  if (resolved.kind !== 'resolved') return null;

  const item = pickLibraryItemForCollectionMember(resolved.items, resolved.member);
  if (!item) return null;

  const wpPluginInfo = resolved.type === 'plugin' ? wpInfo.plugins[resolved.slug] : undefined;
  const wpThemeInfo = resolved.type === 'theme' ? wpInfo.themes[resolved.slug] : undefined;
  const plan = planLibraryBridgeInstall(
    item,
    resolved.type,
    resolved.slug,
    wpPluginInfo,
    wpThemeInfo,
  );
  return { item, plan };
}

/**
 * Install all collection items on each site in order (items array order per site).
 * Continues on per-item failures; returns one line per attempt.
 */
export async function runCollectionInstallOnSites(
  collection: LibraryCollection,
  libraryItems: LibraryItem[],
  siteIds: string[],
  wpInfo: CollectionInstallWpInfoMap,
): Promise<CollectionInstallLineResult[]> {
  const validation = validateCollectionForInstall(collection, libraryItems);
  if (!validation.ok) {
    return siteIds.flatMap((siteId) =>
      collection.items.map((item) => ({
        siteId,
        slug: item.slug,
        type: item.type,
        ok: false,
        message: validation.message,
      })),
    );
  }

  const members = validation.members;
  const results: CollectionInstallLineResult[] = [];

  for (const siteId of siteIds) {
    for (const resolved of members) {
      const planned = planForCollectionMember(resolved, wpInfo);
      if (!planned) {
        results.push({
          siteId,
          slug: resolved.slug,
          type: resolved.type,
          ok: false,
          message: 'Could not resolve library item for this collection entry.',
        });
        continue;
      }

      const { item, plan } = planned;
      if (plan.kind === 'unsupported') {
        results.push({
          siteId,
          slug: resolved.slug,
          type: resolved.type,
          ok: false,
          message: plan.message,
        });
        continue;
      }

      const libraryName = String(item.name ?? '').trim();
      const run = await runLibraryBridgeInstallOnSite(siteId, plan, libraryName);
      results.push({
        siteId,
        slug: resolved.slug,
        type: resolved.type,
        ok: run.ok,
        message: run.message,
      });
    }
  }

  return results;
}
