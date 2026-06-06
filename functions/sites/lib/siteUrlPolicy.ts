import { Query, trimStr } from '@code045/wphubpro-shared';
import type { Databases } from '@code045/wphubpro-shared';

export function normalizeSiteUrlForSites(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().replace(/\/$/, '');
}

export type WorkspaceDescriptor = {
  mode: 'team' | 'personal';
  rowTeamId: string | null;
  authUserId: string;
};

export function workspaceDescriptorForOwner(
  mode: 'team' | 'personal',
  rowTeamId: string | null | undefined,
  authUserId: string | null | undefined,
): WorkspaceDescriptor {
  const rt = trimStr(rowTeamId);
  if (mode === 'team' && rt) {
    return { mode: 'team', rowTeamId: rt, authUserId: trimStr(authUserId) };
  }
  return { mode: 'personal', rowTeamId: null, authUserId: trimStr(authUserId) };
}

export function workspaceDescriptorFromSiteDoc(doc: Record<string, unknown>): WorkspaceDescriptor {
  const docT = trimStr(doc.team_id);
  if (docT) {
    return { mode: 'team', rowTeamId: docT, authUserId: trimStr(doc.user_id ?? doc.userId) };
  }
  return { mode: 'personal', rowTeamId: null, authUserId: trimStr(doc.user_id ?? doc.userId) };
}

export function workspaceDescriptorMatchesSiteDoc(
  desc: WorkspaceDescriptor,
  doc: Record<string, unknown>,
): boolean {
  const docT = trimStr(doc.team_id);
  const docU = trimStr(doc.user_id ?? doc.userId);
  if (desc.mode === 'team' && desc.rowTeamId) {
    return docT === trimStr(desc.rowTeamId);
  }
  return docU === desc.authUserId;
}

export async function findForeignWorkspaceSiteUrlConflict(
  databases: Databases,
  dbId: string,
  coll: string,
  normalizedUrl: string,
  ownerDesc: WorkspaceDescriptor,
  excludeDocumentId: string | null | undefined,
): Promise<Record<string, unknown> | null> {
  if (!normalizedUrl) return null;
  const res = await databases.listDocuments(dbId, coll, [
    Query.equal('site_url', normalizedUrl),
    Query.limit(100),
  ]);
  for (const doc of res.documents || []) {
    if (excludeDocumentId != null && String(doc.$id) === String(excludeDocumentId)) continue;
    if (!workspaceDescriptorMatchesSiteDoc(ownerDesc, doc as Record<string, unknown>)) {
      return doc as Record<string, unknown>;
    }
  }
  return null;
}
