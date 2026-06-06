import { callerUserIdFromReq, membershipCountsForHub, platformTeamsTableId } from '@code045/wphubpro-shared';
import { dbId } from '../../lib/teamHelpers.ts';

/**
 * All Appwrite teams the caller belongs to, with seat hints from `platform_db.teams`.
 */
export default async function handleTeamsList({ req, res, error }, ctx) {
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    return res.json({ success: false, message: 'Unauthorized: could not resolve caller user' }, 401);
  }

  const { databases, teams, users } = ctx;
  if (!teams || !users) {
    return res.json({ success: false, message: 'Server misconfiguration.' }, 500);
  }

  try {
    const memList = await users.listMemberships({ userId: actor });
    const memberships = memList.memberships || [];
    /** @type {Map<string, Record<string, unknown>>} */
    const seen = new Map();
    for (const m of memberships) {
      const tid = String(m.teamId || '').trim();
      if (!tid) continue;
      if (!membershipCountsForHub(m, actor)) continue;
      if (!seen.has(tid)) seen.set(tid, m);
    }

    const teamsColl = platformTeamsTableId();
    const items = [];

    for (const [tid, membership] of seen.entries()) {
      let teamName = tid;
      let totalMembers = 0;
      try {
        const t = await teams.get({ teamId: tid });
        teamName = t.name || tid;
        if (typeof t.total === 'number' && t.total >= 0) totalMembers = t.total;
      } catch {
        // Keep row so non-owner / API edge cases still get a switcher entry (name falls back to id).
        teamName = tid;
      }

      if (!totalMembers) {
        try {
          const ml = await teams.listMemberships({ teamId: tid });
          totalMembers = (ml.memberships || []).filter((x) => membershipCountsForHub(x, actor)).length;
        } catch {
          totalMembers = 0;
        }
      }

      const roles = (membership.roles || []).map((r) => String(r).toLowerCase());
      const isOwner = roles.includes('owner');

      let seatTotal = null;
      try {
        const row = await databases.getDocument(dbId(), teamsColl, tid);
        if (row?.max_seats != null && Number.isFinite(Number(row.max_seats)) && Number(row.max_seats) > 0) {
          seatTotal = Number(row.max_seats);
        }
      } catch {
        /* no row or no access */
      }

      items.push({
        team: { $id: tid, name: teamName },
        isOwner,
        seatsUsed: totalMembers,
        /** Purchased seat cap from platform team row — owners only. */
        seatTotal: isOwner ? seatTotal : null,
      });
    }

    items.sort((a, b) => String(a.team.name).localeCompare(String(b.team.name)));
    return res.json({ success: true, teams: items });
  } catch (err) {
    error(`teamsList: ${err.message}`);
    return res.json({ success: false, message: err.message || 'teamsList failed' }, 400);
  }
};
