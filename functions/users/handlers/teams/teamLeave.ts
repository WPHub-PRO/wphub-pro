import { callerUserIdFromReq, listUserMemberships, userHasConfirmedMembershipInTeam, Query } from '@code045/wphubpro-shared';
import { getAccountByUserId, userHasTeamOwnerRole, dbId, accountsColl } from '../../lib/teamHelpers.ts';

/**
 * Leave team: remove the caller's Appwrite team membership (non-owners only).
 *
 * Anyone with Appwrite role `owner` on this team cannot leave here — including the sole owner and
 * co-owners. They must use **team-handover** so their membership becomes `member`, then they may
 * leave, or use **team-delete** if they are the billing owner and want to remove the workspace.
 */
export default async function handleTeamLeave({ req, res, log, error }, ctx) {
  const payload = req._parsedPayload || {};
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    return res.json({ success: false, message: 'Unauthorized: could not resolve caller user' }, 401);
  }

  const teamId = String(payload.teamId ?? payload.team_id ?? '').trim();
  if (!teamId) {
    return res.json({ success: false, message: 'teamId is required.' }, 400);
  }

  const { databases, teams, users } = ctx;
  if (!teams || !users) {
    return res.json({ success: false, message: 'Server misconfiguration.' }, 500);
  }

  try {
    const isOwner = await userHasTeamOwnerRole(teams, teamId, actor);
    if (isOwner) {
      return res.json(
        {
          success: false,
          message:
            'Team owners cannot leave this way. Hand over ownership to another member first (then you may leave as a member), or delete the team if you manage billing.',
        },
        403,
      );
    }

    const mems = await listUserMemberships(users, actor);
    if (!userHasConfirmedMembershipInTeam(mems, teamId, actor)) {
      return res.json({ success: false, message: 'You are not a member of this team.' }, 403);
    }

    const memList = await teams.listMemberships({ teamId, queries: [Query.equal('userId', actor)] });
    const membership = memList.memberships?.[0];
    if (membership && membership.$id) {
      await teams.deleteMembership({ teamId, membershipId: membership.$id });
    }

    const acc = await getAccountByUserId(databases, actor);
    if (acc && acc.$id && String(acc.active_team_id || '').trim() === teamId) {
      try {
        await databases.updateDocument(dbId(), accountsColl(), acc.$id, { active_team_id: null });
      } catch (e) {
        log(`teamLeave: clear active_team_id ${e.message}`);
      }
    }

    log(`users: teamLeave team=${teamId} user=${actor}`);
    return res.json({ success: true });
  } catch (err) {
    error(`teamLeave: ${err.message}`);
    return res.json({ success: false, message: err.message || 'teamLeave failed' }, 400);
  }
};
