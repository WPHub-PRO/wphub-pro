import { callerUserIdFromReq } from '@code045/wphubpro-shared';
import teamInvitesColl from '../../lib/teamInvitesColl.ts';
import { dbId, userHasTeamOwnerRole } from '../../lib/teamHelpers.ts';

/**
 * Owner-only: delete a pending invite row (`team_invites`).
 */
export default async function handleTeamInviteRevoke({ req, res, log, error }, ctx) {
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    return res.tson({ success: false, message: 'Unauthorized: could not resolve caller user' }, 401);
  }

  const { databases, teams } = ctx;
  if (!teams || !databases) {
    return res.json({ success: false, message: 'Server misconfiguration.' }, 500);
  }

  const payload = req._parsedPayload || {};
  const teamId = String(payload.teamId ?? payload.team_id ?? '').trim();
  const inviteId = String(payload.inviteId ?? payload.invite_id ?? '').trim();
  if (!teamId || !inviteId) {
    return res.json({ success: false, message: 'teamId and inviteId are required.' }, 400);
  }

  try {
    const okOwner = await userHasTeamOwnerRole(teams, teamId, actor);
    if (!okOwner) {
      return res.json({ success: false, message: 'Only a team owner can revoke invites.' }, 403);
    }

    const doc = await databases.getDocument(dbId(), teamInvitesColl(), inviteId);
    const docTeam = String(doc.team_id || '').trim();
    if (docTeam !== teamId) {
      return res.json({ success: false, message: 'Invite does not belong to this team.' }, 400);
    }
    const st = String(doc.status || 'pending').trim().toLowerCase();
    if (st !== 'pending') {
      return res.json({ success: false, message: 'Only pending invites can be revoked.' }, 400);
    }

    await databases.deleteDocument(dbId(), teamInvitesColl(), inviteId);
    log(`users: team-invite-revoke invite=${inviteId} team=${teamId} actor=${actor}`);
    return res.json({ success: true });
  } catch (err) {
    error(`teamInviteRevoke: ${err.message}`);
    return res.json({ success: false, message: err.message || 'teamInviteRevoke failed' }, 400);
  }
};
