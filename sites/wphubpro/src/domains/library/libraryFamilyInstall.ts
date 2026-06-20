import {
  getMemberItemKind,
  getResolvableMemberItems,
  pickLibraryItemForMember,
  resolveFamilyMembers,
  type ResolvedFamilyMember,
} from '@/domains/library/familyMembers';
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
import {
  bulkLineMessage,
  indexBulkResultsForSlugLookup,
  lookupBulkResultForInstallEntry,
  type BulkItemResult,
} from '@/domains/sites/extensionBulkFromSite';
import { getLibraryItemSlug } from '@/domains/library/libraryItemSlug';
import type { WpPluginInfo, WpThemeInfo } from '@/services/wordpress';
import type { LibraryFamily, LibraryItem, LibraryItemType } from '@/types';

export type FamilyInstallLineResult = {
  siteId: string;
  memberSlug: string;
  ok: boolean;
  message: string;
};

export type FamilyInstallWpInfoMap = {
  plugins: Record<string, WpPluginInfo | null | undefined>;
  themes: Record<string, WpThemeInfo | null | undefined>;
};

export type FamilyInstallValidation =
  | { ok: true; members: ResolvedFamilyMember[] }
  | { ok: false; message: string };

function memberLineKey(kind: LibraryItemType, memberSlug: string): string {
  return `${kind}:${memberSlug}`;
}

export function validateFamilyForInstall(
  family: LibraryFamily,
  libraryItems: LibraryItem[],
): FamilyInstallValidation {
  const members = resolveFamilyMembers(family, libraryItems);
  if (members.length === 0) {
    return { ok: false, message: 'This family has no members yet.' };
  }
  const missing = members.filter((m) => m.kind === 'missing');
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Not in library: ${missing.map((m) => m.slug).join(', ')}.`,
    };
  }
  const ambiguous = members.filter((m) => m.kind === 'ambiguous');
  if (ambiguous.length > 0) {
    return {
      ok: false,
      message: `Ambiguous slug (plugin and theme): ${ambiguous.map((m) => m.slug).join(', ')}.`,
    };
  }
  return { ok: true, members };
}

function planForMember(
  member: ResolvedFamilyMember,
  family: LibraryFamily,
  wpInfo: FamilyInstallWpInfoMap,
): { item: LibraryItem; itemKind: 'plugin' | 'theme'; plan: LibraryBridgeInstallPlan } | null {
  const items = getResolvableMemberItems(member);
  const itemKind = getMemberItemKind(member);
  if (!itemKind || items.length === 0) return null;

  const pref = family.memberPreferences?.[member.slug];
  const item = pickLibraryItemForMember(items, pref);
  if (!item) return null;

  const wpPluginInfo = itemKind === 'plugin' ? wpInfo.plugins[member.slug] : undefined;
  const wpThemeInfo = itemKind === 'theme' ? wpInfo.themes[member.slug] : undefined;
  const plan = planLibraryBridgeInstall(item, itemKind, member.slug, wpPluginInfo, wpThemeInfo);
  return { item, itemKind, plan };
}

type PluginBatchEntry = {
  memberSlug: string;
  installSlug: string;
  row: PluginInstallBulkRow;
};

type ThemeBatchEntry = {
  memberSlug: string;
  installSlug: string;
  row: ThemeInstallBulkRow;
};

function mapBulkResultsToFamilyLines(
  siteId: string,
  entries: { memberSlug: string; installSlug: string }[],
  bulkResults: BulkItemResult[],
): FamilyInstallLineResult[] {
  const byId = indexBulkResultsForSlugLookup(bulkResults);

  return entries.map(({ memberSlug, installSlug }, index) => {
    const hit = lookupBulkResultForInstallEntry(
      byId,
      [installSlug, memberSlug],
      bulkResults,
      index,
    );
    if (!hit) {
      return {
        siteId,
        memberSlug,
        ok: false,
        message: 'No install result returned for this member.',
      };
    }
    return {
      siteId,
      memberSlug,
      ok: hit.ok,
      message: bulkLineMessage(hit),
    };
  });
}

/**
 * Install all family members on each site: one plugins bulk call, then one themes bulk call per site.
 * Continues on per-item failures; returns one line per member per site.
 */
export async function runFamilyInstallOnSites(
  family: LibraryFamily,
  libraryItems: LibraryItem[],
  siteIds: string[],
  wpInfo: FamilyInstallWpInfoMap,
): Promise<FamilyInstallLineResult[]> {
  const validation = validateFamilyForInstall(family, libraryItems);
  if (!validation.ok) {
    return siteIds.flatMap((siteId) =>
      family.memberSlugs.map((memberSlug) => ({
        siteId,
        memberSlug,
        ok: false,
        message: validation.message,
      })),
    );
  }

  const members = validation.members;
  const results: FamilyInstallLineResult[] = [];

  for (const siteId of siteIds) {
    const pluginRows: PluginBatchEntry[] = [];
    const themeRows: ThemeBatchEntry[] = [];
    const lineByMember = new Map<string, FamilyInstallLineResult>();

    for (const member of members) {
      const resolved = planForMember(member, family, wpInfo);
      if (!resolved) {
        if (member.kind === 'plugin' || member.kind === 'theme') {
          lineByMember.set(memberLineKey(member.kind, member.slug), {
            siteId,
            memberSlug: member.slug,
            ok: false,
            message: 'Could not resolve library item for this member.',
          });
        }
        continue;
      }

      const { item, itemKind, plan } = resolved;
      if (plan.kind === 'unsupported') {
        lineByMember.set(memberLineKey(itemKind, member.slug), {
          siteId,
          memberSlug: member.slug,
          ok: false,
          message: plan.message,
        });
        continue;
      }

      const wpSlug = getLibraryItemSlug(item);
      if (itemKind === 'plugin') {
        const row = planToPluginInstallRow(plan);
        if (!row) {
          lineByMember.set(memberLineKey(itemKind, member.slug), {
            siteId,
            memberSlug: member.slug,
            ok: false,
            message: 'Could not build plugin install row.',
          });
          continue;
        }
        const installSlug = row.slug || wpSlug;
        pluginRows.push({
          memberSlug: member.slug,
          installSlug,
          row: {
            ...row,
            slug: installSlug,
            routeSlug: row.routeSlug || wpSlug,
          },
        });
      } else {
        const row = planToThemeInstallRow(plan);
        if (!row) {
          lineByMember.set(memberLineKey(itemKind, member.slug), {
            siteId,
            memberSlug: member.slug,
            ok: false,
            message: 'Could not build theme install row.',
          });
          continue;
        }
        const installSlug = row.slug || wpSlug;
        themeRows.push({
          memberSlug: member.slug,
          installSlug,
          row: {
            ...row,
            slug: installSlug,
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
          lineByMember.set(memberLineKey('plugin', entry.memberSlug), {
            siteId,
            memberSlug: entry.memberSlug,
            ok: false,
            message: bulk.message,
          });
        }
      } else {
        for (const line of mapBulkResultsToFamilyLines(
          siteId,
          pluginRows.map((e) => ({
            memberSlug: e.memberSlug,
            installSlug: e.installSlug,
          })),
          bulk.results,
        )) {
          lineByMember.set(memberLineKey('plugin', line.memberSlug), line);
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
          lineByMember.set(memberLineKey('theme', entry.memberSlug), {
            siteId,
            memberSlug: entry.memberSlug,
            ok: false,
            message: bulk.message,
          });
        }
      } else {
        for (const line of mapBulkResultsToFamilyLines(
          siteId,
          themeRows.map((e) => ({
            memberSlug: e.memberSlug,
            installSlug: e.installSlug,
          })),
          bulk.results,
        )) {
          lineByMember.set(memberLineKey('theme', line.memberSlug), line);
        }
      }
    }

    for (const member of members) {
      if (member.kind !== 'plugin' && member.kind !== 'theme') continue;
      const line = lineByMember.get(memberLineKey(member.kind, member.slug));
      if (line) results.push(line);
    }
  }

  return results;
}
