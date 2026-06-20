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
import { getLibraryItemSlug } from '@/domains/library/libraryItemSlug';
import type { WpPluginInfo, WpThemeInfo } from '@/services/wordpress';
import type { LibraryFamily, LibraryItem } from '@/types';

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
  row: PluginInstallBulkRow;
};

type ThemeBatchEntry = {
  memberSlug: string;
  row: ThemeInstallBulkRow;
};

function resultMessageForBulkLine(ok: boolean, error?: string, fallback = 'Install failed.'): string {
  if (ok) return 'Installed.';
  return (error ?? '').trim() || fallback;
}

function mapBulkResultsToFamilyLines(
  siteId: string,
  entries: { memberSlug: string }[],
  bulkResults: { id: string; ok: boolean; error?: string }[],
): FamilyInstallLineResult[] {
  const byId = new Map<string, { ok: boolean; error?: string }>();
  for (const r of bulkResults) {
    const key = r.id.trim().toLowerCase();
    if (key) byId.set(key, { ok: r.ok, error: r.error });
  }

  return entries.map(({ memberSlug }) => {
    const hit = byId.get(memberSlug.trim().toLowerCase());
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
      message: resultMessageForBulkLine(hit.ok, hit.error),
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
        lineByMember.set(member.slug, {
          siteId,
          memberSlug: member.slug,
          ok: false,
          message: 'Could not resolve library item for this member.',
        });
        continue;
      }

      const { item, itemKind, plan } = resolved;
      if (plan.kind === 'unsupported') {
        lineByMember.set(member.slug, {
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
          lineByMember.set(member.slug, {
            siteId,
            memberSlug: member.slug,
            ok: false,
            message: 'Could not build plugin install row.',
          });
          continue;
        }
        pluginRows.push({
          memberSlug: member.slug,
          row: {
            ...row,
            slug: row.slug || wpSlug,
            routeSlug: row.routeSlug || wpSlug,
          },
        });
      } else {
        const row = planToThemeInstallRow(plan);
        if (!row) {
          lineByMember.set(member.slug, {
            siteId,
            memberSlug: member.slug,
            ok: false,
            message: 'Could not build theme install row.',
          });
          continue;
        }
        themeRows.push({
          memberSlug: member.slug,
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
          lineByMember.set(entry.memberSlug, {
            siteId,
            memberSlug: entry.memberSlug,
            ok: false,
            message: bulk.message,
          });
        }
      } else {
        for (const line of mapBulkResultsToFamilyLines(
          siteId,
          pluginRows.map((e) => ({ memberSlug: e.memberSlug })),
          bulk.results,
        )) {
          lineByMember.set(line.memberSlug, line);
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
          lineByMember.set(entry.memberSlug, {
            siteId,
            memberSlug: entry.memberSlug,
            ok: false,
            message: bulk.message,
          });
        }
      } else {
        for (const line of mapBulkResultsToFamilyLines(
          siteId,
          themeRows.map((e) => ({ memberSlug: e.memberSlug })),
          bulk.results,
        )) {
          lineByMember.set(line.memberSlug, line);
        }
      }
    }

    for (const member of members) {
      const line = lineByMember.get(member.slug);
      if (line) results.push(line);
    }
  }

  return results;
}
