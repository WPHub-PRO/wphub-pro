import { normalizeWpSlug } from '@/domains/library/libraryDocument';

/** When team + personal library rows are merged, prefer the active team document per slug+type. */
export function dedupeLibraryDocumentsForTeamWorkspace(
  documents: Record<string, unknown>[],
  activeTeamId: string,
): Record<string, unknown>[] {
  const byKey = new Map<string, Record<string, unknown>>();
  for (const doc of documents) {
    const type = String(doc.type ?? '').trim().toLowerCase();
    const wpSlug = normalizeWpSlug(String(doc.wpSlug ?? doc.wp_slug ?? ''));
    if (!type || !wpSlug) {
      byKey.set(String(doc.$id), doc);
      continue;
    }
    const key = `${type}:${wpSlug}`;
    const existing = byKey.get(key);
    const docTeamId = String(doc.team_id ?? doc.teamId ?? '').trim();
    if (!existing) {
      byKey.set(key, doc);
      continue;
    }
    const existingTeamId = String(existing.team_id ?? existing.teamId ?? '').trim();
    if (docTeamId === activeTeamId && existingTeamId !== activeTeamId) {
      byKey.set(key, doc);
    }
  }
  return [...byKey.values()];
}
