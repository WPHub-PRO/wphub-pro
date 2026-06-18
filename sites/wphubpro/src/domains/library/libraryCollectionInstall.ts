import {
  pickLibraryItemForCollectionMember,
  resolveCollectionMembers,
  type ResolvedCollectionMember,
} from '@/domains/library/collectionMembers';
import {
  planLibraryBridgeInstall,
  planToPluginInstallRow,
  planToThemeInstallRow,
  runPluginInstallBulkOnSite,
  runThemeInstallBulkOnSite,
  type LibraryBridgeInstallPlan,
  type PluginInstallBulkRow,
  type ThemeInstallBulkRow,
} from '@/domains/library/libraryBridgeInstall';
import { getLibraryItemSlug } from '@/domains/library/libraryItemSlug';
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

type PluginBatchEntry = {
  slug: string;
  row: PluginInstallBulkRow;
};

type ThemeBatchEntry = {
  slug: string;
  row: ThemeInstallBulkRow;
};

function resultMessageForBulkLine(ok: boolean, error?: string, fallback = 'Install failed.'): string {
  if (ok) return 'Installed.';
  return (error ?? '').trim() || fallback;
}

function mapBulkResultsToLines(
  siteId: string,
  entries: { slug: string; type: LibraryItemType }[],
  bulkResults: { id: string; ok: boolean; error?: string }[],
): CollectionInstallLineResult[] {
  const byId = new Map<string, { ok: boolean; error?: string }>();
  for (const r of bulkResults) {
    const key = r.id.trim().toLowerCase();
    if (key) byId.set(key, { ok: r.ok, error: r.error });
  }

  return entries.map(({ slug, type }) => {
    const hit = byId.get(slug.trim().toLowerCase());
    if (!hit) {
      return {
        siteId,
        slug,
        type,
        ok: false,
        message: 'No install result returned for this item.',
      };
    }
    return {
      siteId,
      slug,
      type,
      ok: hit.ok,
      message: resultMessageForBulkLine(hit.ok, hit.error),
    };
  });
}

/**
 * Install all collection items on each site: one plugins bulk call, then one themes bulk call per site.
 * Continues on per-item failures; returns one line per collection member per site.
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
    const pluginRows: PluginBatchEntry[] = [];
    const themeRows: ThemeBatchEntry[] = [];
    const lineByKey = new Map<string, CollectionInstallLineResult>();

    for (const resolved of members) {
      const key = `${resolved.type}:${resolved.slug}`;
      const planned = planForCollectionMember(resolved, wpInfo);
      if (!planned) {
        lineByKey.set(key, {
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
        lineByKey.set(key, {
          siteId,
          slug: resolved.slug,
          type: resolved.type,
          ok: false,
          message: plan.message,
        });
        continue;
      }

      const wpSlug = getLibraryItemSlug(item);
      if (resolved.type === 'plugin') {
        const row = planToPluginInstallRow(plan);
        if (!row) {
          lineByKey.set(key, {
            siteId,
            slug: wpSlug,
            type: resolved.type,
            ok: false,
            message: 'Could not build plugin install row.',
          });
          continue;
        }
        pluginRows.push({
          slug: wpSlug,
          row: {
            ...row,
            slug: row.slug || wpSlug,
            routeSlug: row.routeSlug || wpSlug,
          },
        });
      } else {
        const row = planToThemeInstallRow(plan);
        if (!row) {
          lineByKey.set(key, {
            siteId,
            slug: wpSlug,
            type: resolved.type,
            ok: false,
            message: 'Could not build theme install row.',
          });
          continue;
        }
        themeRows.push({
          slug: wpSlug,
          row: {
            ...row,
            slug: row.slug || wpSlug,
            routeSlug: row.routeSlug || wpSlug,
          },
        });
      }
    }

    if (pluginRows.length > 0) {
      const bulk = await runPluginInstallBulkOnSite(
        siteId,
        pluginRows.map((e) => e.row),
      );
      if (!bulk.results.length && !bulk.ok) {
        for (const entry of pluginRows) {
          lineByKey.set(`plugin:${entry.slug}`, {
            siteId,
            slug: entry.slug,
            type: 'plugin',
            ok: false,
            message: bulk.message,
          });
        }
      } else {
        for (const line of mapBulkResultsToLines(
          siteId,
          pluginRows.map((e) => ({ slug: e.slug, type: 'plugin' as const })),
          bulk.results,
        )) {
          lineByKey.set(`plugin:${line.slug}`, line);
        }
      }
    }

    if (themeRows.length > 0) {
      const bulk = await runThemeInstallBulkOnSite(
        siteId,
        themeRows.map((e) => e.row),
      );
      if (!bulk.results.length && !bulk.ok) {
        for (const entry of themeRows) {
          lineByKey.set(`theme:${entry.slug}`, {
            siteId,
            slug: entry.slug,
            type: 'theme',
            ok: false,
            message: bulk.message,
          });
        }
      } else {
        for (const line of mapBulkResultsToLines(
          siteId,
          themeRows.map((e) => ({ slug: e.slug, type: 'theme' as const })),
          bulk.results,
        )) {
          lineByKey.set(`theme:${line.slug}`, line);
        }
      }
    }

    for (const resolved of members) {
      const key = `${resolved.type}:${resolved.slug}`;
      const line = lineByKey.get(key);
      if (line) results.push(line);
    }
  }

  return results;
}
