import { callerUserIdFromReq, listUserMemberships, userHasConfirmedMembershipInTeam, ID } from '@code045/wphubpro-shared';
import { verifyTeamInviteToken, canonicalExpiresIso } from '../../lib/teamInviteToken.ts';
import teamInvitesColl from '../../lib/teamInvitesColl.ts';
import {
  getAccountByUserId,
  dbId,
  accountsColl,
  switchUserToWorkspaceIfNeeded,
} from '../../lib/teamHelpers.ts';
import notifyTeamInviteOwner from '../../lib/notifyTeamInviteOwner.ts';

function readInviteParams(payload) {
  const inviteId = String(payload.inviteId ?? payload.invite_id ?? '').trim();
  const token = String(payload.token ?? payload.t ?? '').trim();
  return { inviteId, token };
}

/**
 * Authenticated: accept invite after the user has registered / signed in with the invited email.
 */
export default async function handleTeamInviteClaim({ req, res, log, error }, ctx) {
  const payload = req._parsedPayload || {};
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    return res.json({ success: false, message: 'Unauthorized: could not resolve caller user' }, 401);
  }

  const { inviteId, token } = readInviteParams(payload);
  if (!inviteId || !token) {
    return res.json({ success: false, message: 'inviteId and token are required.' }, 400);
  }

  const { databases, teams, users } = ctx;
  if (!teams || !users) {
    return res.json({ success: false, message: 'Server misconfiguration.' }, 500);
  }

  try {
    const me = await users.get(actor);
    const sessionEmail = String(me.email || '')
      .trim()
      .toLowerCase();

    const doc = await databases.getDocument(dbId(), teamInvitesColl(), inviteId);
    const status = String(doc.status || 'pending').toLowerCase();
    if (status !== 'pending') {
      return res.json({ success: false, message: 'This invitation is no longer active.' }, 400);
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

    const inviteEmail = String(doc.email || '')
      .trim()
      .toLowerCase();
    if (!inviteEmail || inviteEmail !== sessionEmail) {
      return res.json(
        {
          success: false,
          message: 'Sign in with the invited email address to accept this invitation.',
        },
        403,
      );
    }

    const teamId = String(doc.team_id || '').trim();
    if (!teamId) {
      return res.json({ success: false, message: 'Invite is missing team id.' }, 400);
    }

    const targetMems = await listUserMemberships(users, actor);
    if (userHasConfirmedMembershipInTeam(targetMems, teamId, actor)) {
      const sw = await switchUserToWorkspaceIfNeeded({
        databases,
        users,
        sessionUserId: actor,
        targetTeamId: teamId,
      });
      if (!sw.ok) {
        return res.json({ success: false, message: sw.message || 'Could not switch workspace.' }, 400);
      }
      try {
        await databases.deleteDocument(dbId(), teamInvitesColl(), inviteId);
      } catch {
        /* ignore */
      }
      return res.json({ success: true, alreadyMember: true, teamId, active_team_id: sw.activeTeamId });
    }

    await teams.createMembership({
      teamId,
      userId: actor,
      roles: ['member'],
    });

    const targetAcc = await getAccountByUserId(databases, actor);
    if (targetAcc && targetAcc.$id) {
      const patch = {};
      if (!String(targetAcc.active_team_id || '').trim()) {
        patch.active_team_id = teamId;
      }
      if (Object.keys(patch).length > 0) {
        await databases.updateDocument(dbId(), accountsColl(), targetAcc.$id, patch);
      }
    } else {
      await databases.createDocument(dbId(), accountsColl(), ID.unique(), {
        user_id: actor,
        active_team_id: teamId,
      });
    }

    const sw = await switchUserToWorkspaceIfNeeded({
      databases,
      users,
      sessionUserId: actor,
      targetTeamId: teamId,
    });
    if (!sw.ok) {
      return res.json({ success: false, message: sw.message || 'Could not switch workspace.' }, 400);
    }

    const ownerId = String(doc.invited_by_user_id || '').trim();
    await databases.deleteDocument(dbId(), teamInvitesColl(), inviteId);

    let teamName = '';
    try {
      const t = await teams.get(teamId);
      teamName = String(t.name || '').trim();
    } catch {
      teamName = '';
    }

    if (ownerId) {
      await notifyTeamInviteOwner(databases, {
        ownerUserId: ownerId,
        users: ctx.users,
        metadata: { teamId, inviteId, email: inviteEmail, outcome: 'accepted', team_name: teamName },
        body: `${inviteEmail} joined${teamName ? ` ${teamName}` : ' your team'}.`,
      });
    }

    log(`users: team-invite-claim team=${teamId} user=${actor}`);
    return res.json({ success: true, teamId, active_team_id: sw.activeTeamId });
  } catch (err) {
    error(`team-invite-claim: ${err.message}`);
    return res.json({ success: false, message: err.message || 'team-invite-claim failed' }, 400);
  }
};
