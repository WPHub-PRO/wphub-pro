import {
  getMemberItemKind,
  getResolvableMemberItems,
  pickLibraryItemForMember,
  resolveFamilyMembers,
  type ResolvedFamilyMember,
} from '@/domains/library/familyMembers';
import {
  planLibraryBridgeInstall,
  runLibraryBridgeInstallOnSite,
  type LibraryBridgeInstallPlan,
} from '@/domains/library/libraryBridgeInstall';
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

/**
 * Install all family members on each site in order (memberSlugs order per site).
 * Continues on per-member failures; returns one line per attempt.
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
    for (const member of members) {
      const resolved = planForMember(member, family, wpInfo);
      if (!resolved) {
        results.push({
          siteId,
          memberSlug: member.slug,
          ok: false,
          message: 'Could not resolve library item for this member.',
        });
        continue;
      }

      const { item, plan } = resolved;
      if (plan.kind === 'unsupported') {
        results.push({
          siteId,
          memberSlug: member.slug,
          ok: false,
          message: plan.message,
        });
        continue;
      }

      const libraryName = String(item.name ?? '').trim();
      const run = await runLibraryBridgeInstallOnSite(siteId, plan, libraryName);
      results.push({
        siteId,
        memberSlug: member.slug,
        ok: run.ok,
        message: run.message,
      });
    }
  }

  return results;
}
