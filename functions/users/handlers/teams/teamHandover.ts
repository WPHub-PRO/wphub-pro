import { callerUserIdFromReq, listUserMemberships, userHasConfirmedMembershipInTeam, Query } from '@code045/wphubpro-shared';
import platformTeamsTableId from '../../lib/platformTeamsTableId.ts';
import { userHasTeamOwnerRole, dbId } from '../../lib/teamHelpers.ts';

/**
 * Hand over platform + Appwrite ownership: new owner gets role `owner`, previous owner becomes `member`.
 * After handover, the former owner remains a member and may use **team-leave** if they want out.
 */
export default async function handleTeamHandover({ req, res, log, error }, ctx) {
  const payload = req._parsedPayload || {};
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    return res.json({ success: false, message: 'Unauthorized: could not resolve caller user' }, 401);
  }

  const teamId = String(payload.teamId ?? payload.team_id ?? '').trim();
  const newOwnerUserId = String(
    payload.newOwnerUserId ?? payload.new_owner_user_id ?? payload.targetUserId ?? '',
  ).trim();

  if (!teamId) {
    return res.json({ success: false, message: 'teamId is required.' }, 400);
  }
  if (!newOwnerUserId) {
    return res.json({ success: false, message: 'newOwnerUserId is required.' }, 400);
  }
  if (newOwnerUserId === actor) {
    return res.json({ success: false, message: 'Choose another member as the new owner.' }, 400);
  }

  const { databases, teams, users } = ctx;
  if (!teams || !users) {
    return res.json({ success: false, message: 'Server misconfiguration.' }, 500);
  }

  const teamsColl = platformTeamsTableId();

  try {
    /** @type {import('node-appwrite').Models.Document | null} */
    let row = null;
    try {
      row = await databases.getDocument(dbId(), teamsColl, teamId);
    } catch {
      return res.json({ success: false, message: 'Team metadata not found.' }, 404);
    }

    const platformOwner = String(row.owner_id || '').trim();
    if (!platformOwner || platformOwner !== actor) {
      return res.json({ success: false, message: 'Only the current team owner can hand over ownership.' }, 403);
    }

    const actorIsAppwriteOwner = await userHasTeamOwnerRole(teams, teamId, actor);
    if (!actorIsAppwriteOwner) {
      return res.json(
        { success: false, message: 'Owner metadata does not match Appwrite roles; contact support.' },
        403,
      );
    }

    const newMems = await listUserMemberships(users, newOwnerUserId);
    if (!userHasConfirmedMembershipInTeam(newMems, teamId, newOwnerUserId)) {
      return res.json(
        { success: false, message: 'The new owner must already be a member of this team.' },
        400,
      );
    }

    const newList = await teams.listMemberships({
      teamId,
      queries: [Query.equal('userId', newOwnerUserId)],
    });
    const oldList = await teams.listMemberships({
      teamId,
      queries: [Query.equal('userId', actor)],
    });
    const newM = newList.memberships?.[0];
    const oldM = oldList.memberships?.[0];
    if (!newM?.$id || !oldM?.$id) {
      return res.json({ success: false, message: 'Could not resolve team memberships.' }, 400);
    }

    await teams.updateMembership({ teamId, membershipId: newM.$id, roles: ['owner'] });
    await teams.updateMembership({ teamId, membershipId: oldM.$id, roles: ['member'] });

    await databases.updateDocument(dbId(), teamsColl, teamId, { owner_id: newOwnerUserId });

    log(`users: teamHandover team=${teamId} from=${actor} to=${newOwnerUserId}`);
    return res.json({ success: true, newOwnerUserId });
  } catch (err) {
    error(`teamHandover: ${err.message}`);
    return res.json({ success: false, message: err.message || 'teamHandover failed' }, 400);
  }
};
