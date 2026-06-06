import { callerUserIdFromReq, Query } from '@code045/wphubpro-shared';
import teamInvitesColl from '../../lib/teamInvitesColl.ts';
import { dbId, userHasTeamOwnerRole } from '../../lib/teamHelpers.ts';

/**
 * Owner-only: list pending team invitations for `team_id`.
 */
export default async function handleTeamInvitesList({ req, res, error }, ctx) {
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
  if (!teamId) {
    return res.json({ success: false, message: 'teamId is required.' }, 400);
  }

  try {
    const okOwner = await userHasTeamOwnerRole(teams, teamId, actor);
    if (!okOwner) {
      return res.json({ success: false, message: 'Only a team owner can view pending invites.' }, 403);
    }

    let listed;
    try {
      listed = await databases.listDocuments(dbId(), teamInvitesColl(), [
        Query.equal('team_id', teamId),
        Query.equal('status', 'pending'),
        Query.limit(100),
        Query.orderDesc('$createdAt'),
      ]);
    } catch {
      const fallback = await databases.listDocuments(dbId(), teamInvitesColl(), [
        Query.equal('team_id', teamId),
        Query.limit(100),
      ]);
      listed = {
        documents: (fallback.documents || []).filter(
          (d) => String(d.status || 'pending').trim().toLowerCase() === 'pending',
        ),
      };
      listed.documents.sort((a, b) => {
        const ca = String(a.$createdAt || '');
        const cb = String(b.$createdAt || '');
        return cb.localeCompare(ca);
      });
    }

    const invites = (listed.documents || []).map((d) => ({
      inviteId: String(d.$id || '').trim(),
      email: String(d.email || '').trim().toLowerCase(),
      status: String(d.status || 'pending').trim().toLowerCase(),
      expiresAt: d.expires_at != null ? String(d.expires_at) : '',
      invitedAt: d.$createdAt != null ? String(d.$createdAt) : '',
      invitedByUserId: String(d.invited_by_user_id || '').trim(),
    }));

    return res.json({ success: true, invites });
  } catch (err) {
    error(`teamInvitesList: ${err.message}`);
    return res.json({ success: false, message: err.message || 'teamInvitesList failed' }, 400);
  }
};
