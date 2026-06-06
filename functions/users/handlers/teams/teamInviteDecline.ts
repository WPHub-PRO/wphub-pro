import { verifyTeamInviteToken, canonicalExpiresIso } from '../../lib/teamInviteToken.ts';
import teamInvitesColl from '../../lib/teamInvitesColl.ts';
import { dbId } from '../../lib/teamHelpers.ts';
import notifyTeamInviteOwner from '../../lib/notifyTeamInviteOwner.ts';

function readInviteParams(payload) {
  const inviteId = String(payload.inviteId ?? payload.invite_id ?? payload.i ?? '').trim();
  const token = String(payload.token ?? payload.t ?? '').trim();
  return { inviteId, token };
}

/**
 * Public: decline and remove invite; notify owner.
 */
export default async function handleTeamInviteDecline({ req, res, log, error }, ctx) {
  const payload = req._parsedPayload || {};
  const { inviteId, token } = readInviteParams(payload);
  if (!inviteId || !token) {
    return res.json({ success: false, message: 'inviteId and token are required.' }, 400);
  }

  const { databases, teams, users } = ctx;
  if (!databases || !users) {
    return res.json({ success: false, message: 'Server misconfiguration.' }, 500);
  }

  try {
    const doc = await databases.getDocument(dbId(), teamInvitesColl(), inviteId);
    const status = String(doc.status || 'pending').toLowerCase();
    if (status !== 'pending') {
      return res.json({ success: true, alreadyHandled: true });
    }
    if (!verifyTeamInviteToken(doc, token)) {
      return res.json({ success: false, message: 'Invalid invitation link.' }, 400);
    }
    const expIso = canonicalExpiresIso(doc);
    if (expIso) {
      const expMs = Date.parse(expIso);
      if (Number.isFinite(expMs) && expMs < Date.now()) {
        return res.json({ success: false, message: 'This invitation has expired.' }, 400);
      }
    }

    const teamId = String(doc.team_id || '').trim();
    const invitedEmail = String(doc.email || '').trim();
    const ownerId = String(doc.invited_by_user_id || '').trim();

    await databases.deleteDocument(dbId(), teamInvitesColl(), inviteId);

    let teamName = '';
    if (teams && teamId) {
      try {
        const t = await teams.get(teamId);
        teamName = String(t.name || '').trim();
      } catch {
        teamName = '';
      }
    }

    if (ownerId) {
      await notifyTeamInviteOwner(databases, {
        ownerUserId: ownerId,
        users,
        metadata: { teamId, inviteId, email: invitedEmail, outcome: 'declined', team_name: teamName },
        body: `${invitedEmail} declined the invite${teamName ? ` to ${teamName}` : ''}.`,
      });
    }

    log(`users: team-invite-decline invite=${inviteId}`);
    return res.json({ success: true });
  } catch (err) {
    error(`team-invite-decline: ${err.message}`);
    return res.json({ success: false, message: err.message || 'Decline failed' }, 400);
  }
};
