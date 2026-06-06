import { Query } from '@code045/wphubpro-shared';
import platformTeamsTableId from '../../lib/platformTeamsTableId.ts';
import { dbId } from '../../lib/teamHelpers.ts';

const PAGE = 100;
const MAX_SCAN = 4000;

/**
 * @param {object} doc platform `teams` row
 * @param {{ get: (args: { teamId: string }) => Promise<{ name?: string }>; listMemberships: (args: { teamId: string }) => Promise<{ memberships?: unknown[] }> }} teams
 * @param {{ teamName?: string; skipTeamGet?: boolean }} [opts]
 */
async function buildAdminTeamListRow(doc, teams, opts = {}) {
  const id = String(doc.$id || '').trim();
  let teamName = typeof opts.teamName === 'string' ? opts.teamName : '';
  let memberCount = 0;
  try {
    if (!opts.skipTeamGet) {
      const t = await teams.get({ teamId: id });
      teamName = t.name || '';
    }
    const memList = await teams.listMemberships({ teamId: id });
    memberCount = (memList.memberships || []).length;
  } catch {
    /* team may have been deleted in Appwrite */
  }
  return {
    teamId: id,
    teamName,
    ownerId: doc.owner_id ?? '',
    maxSeats: doc.max_seats,
    stripeCustomerId: doc.stripe_customer_id ?? '',
    stripeSubscriptionId: doc.stripe_subscription_id ?? '',
    $createdAt: doc.$createdAt,
    memberCount,
  };
}

/**
 * Admin: list `teams` metadata rows with Appwrite team name.
 * Optional `search` (non-empty): scan recent team rows, match team id or name (case-insensitive), then paginate matches.
 */
export default async function handleAdminTeamsList({ req, res, error }, ctx) {
  const payload = req._parsedPayload || {};
  const limit = Math.max(1, Math.min(100, Number(payload.limit) || 25));
  const offset = Math.max(0, Number(payload.offset) || 0);
  const searchRaw = typeof payload.search === 'string' ? payload.search.trim() : '';
  const needle = searchRaw.toLowerCase();
  const teamsColl = platformTeamsTableId();

  const { databases, teams } = ctx;
  if (!teams) {
    return res.json({ success: false, message: 'Server misconfiguration.' }, 500);
  }

  try {
    if (!needle) {
      const out = await databases.listDocuments(dbId(), teamsColl, [
        Query.orderDesc('$createdAt'),
        Query.limit(limit),
        Query.offset(offset),
      ]);

      const rows = [];
      for (const doc of out.documents || []) {
        rows.push(await buildAdminTeamListRow(doc, teams));
      }

      return res.json({ success: true, rows, total: out.total ?? rows.length });
    }

    const matches = [];
    let apiOffset = 0;
    let scanned = 0;

    while (scanned < MAX_SCAN) {
      const out = await databases.listDocuments(dbId(), teamsColl, [
        Query.orderDesc('$createdAt'),
        Query.limit(PAGE),
        Query.offset(apiOffset),
      ]);
      const docs = out.documents || [];
      if (!docs.length) break;

      for (const doc of docs) {
        scanned += 1;
        const id = String(doc.$id || '').trim();
        let teamName = '';
        try {
          const t = await teams.get({ teamId: id });
          teamName = t.name || '';
        } catch {
          /* */
        }
        const hay = `${id} ${teamName}`.toLowerCase();
        if (!hay.includes(needle)) continue;
        matches.push(await buildAdminTeamListRow(doc, teams, { teamName, skipTeamGet: true }));
      }

      apiOffset += docs.length;
      if (docs.length < PAGE) break;
    }

    const total = matches.length;
    const rows = matches.slice(offset, offset + limit);
    return res.json({ success: true, rows, total });
  } catch (err) {
    error(`adminTeamsList: ${err.message}`);
    return res.json({ success: false, message: err.message || 'adminTeamsList failed' }, 400);
  }
};
