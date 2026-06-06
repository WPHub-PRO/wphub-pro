import { callerUserIdFromReq, listUserMemberships, userHasConfirmedMembershipInTeam, Query } from '@code045/wphubpro-shared';
import { getAccountByUserId, userHasTeamOwnerRole, dbId, accountsColl, firstOwnedPlatformTeamId } from '../../lib/teamHelpers.ts';

/**
 * Team owner removes a member: delete Appwrite team membership only.
 * Clears `active_team_id` on the target account when it pointed at this team.
 */
export default async function handleTeamRemoveMember({ req, res, log, error }, ctx) {
  const payload = req._parsedPayload || {};
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    return res.json({ success: false, message: 'Unauthorized: could not resolve caller user' }, 401);
  }

  const targetUserId = String(payload.userId ?? payload.user_id ?? '').trim();
  if (!targetUserId) {
    return res.json({ success: false, message: 'userId is required.' }, 400);
  }
  if (targetUserId === actor) {
    return res.json({ success: false, message: 'Use account settings to leave or delete your own account.' }, 400);
  }

  const { databases, teams, users } = ctx;
  if (!teams || !users) {
    return res.json({ success: false, message: 'Server misconfiguration.' }, 500);
  }

  try {
    let teamId = String(payload.teamId ?? payload.team_id ?? '').trim();
    if (!teamId) {
      teamId = await firstOwnedPlatformTeamId(users, databases, actor);
    }
    if (!teamId) {
      return res.json({ success: false, message: 'teamId is required, or create a team first.' }, 400);
    }
    const okOwner = await userHasTeamOwnerRole(teams, teamId, actor);
    if (!okOwner) {
      return res.json({ success: false, message: 'Only a team owner can remove members.' }, 403);
    }

    const targetMems = await listUserMemberships(users, targetUserId);
    if (!userHasConfirmedMembershipInTeam(targetMems, teamId, targetUserId)) {
      return res.json({ success: false, message: 'This user is not a member of this team.' }, 403);
    }

    const memList = await teams.listMemberships({ teamId, queries: [Query.equal('userId', targetUserId)] });
    const membership = memList.memberships?.[0];
    if (membership && membership.$id) {
      await teams.deleteMembership({ teamId, membershipId: membership.$id });
    }

    const targetAcc = await getAccountByUserId(databases, targetUserId);
    if (targetAcc && targetAcc.$id && String(targetAcc.active_team_id || '').trim() === teamId) {
      try {
        await databases.updateDocument(dbId(), accountsColl(), targetAcc.$id, { active_team_id: null });
      } catch (e) {
        log(`teamRemoveMember: clear active_team_id ${e.message}`);
      }
    }

    log(`users: teamRemoveMember removed membership team=${teamId} user=${targetUserId}`);
    return res.json({ success: true, deletedUserId: targetUserId });
  } catch (err) {
    error(`teamRemoveMember: ${err.message}`);
    return res.json({ success: false, message: err.message || 'teamRemoveMember failed' }, 400);
  }
};
