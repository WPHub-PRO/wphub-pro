import { verifyTeamInviteToken, canonicalExpiresIso } from '../../lib/teamInviteToken.ts';
import teamInvitesColl from '../../lib/teamInvitesColl.ts';
import { dbId } from '../../lib/teamHelpers.ts';

function readInviteParams(payload) {
  const inviteId = String(payload.inviteId ?? payload.invite_id ?? payload.i ?? '').trim();
  const token = String(payload.token ?? payload.t ?? '').trim();
  return { inviteId, token };
}

/**
 * Public: validate signed invite and return safe preview for the invite landing page.
 */
export default async function handleTeamInvitePreview({ req, res, log, error }, ctx) {
  const payload = req._parsedPayload || {};
  const { inviteId, token } = readInviteParams(payload);
  if (!inviteId || !token) {
    return res.json({ success: false, message: 'inviteId and token are required.' }, 400);
  }

  const { databases, teams } = ctx;
  if (!databases) {
    return res.json({ success: false, message: 'Server misconfiguration.' }, 500);
  }

  try {
    const doc = await databases.getDocument(dbId(), teamInvitesColl(), inviteId);
    const status = String(doc.status || 'pending').toLowerCase();
    if (status !== 'pending') {
      return res.json({ success: false, message: 'This invitation is no longer active.' }, 400);
    }
    if (!verifyTeamInviteToken(doc, token)) {
      return res.json({ success: false, message: 'Invalid or expired invitation link.' }, 400);
    }

    const expIso = canonicalExpiresIso(doc);
    if (expIso) {
      const expMs = Date.parse(expIso);
      if (Number.isFinite(expMs) && expMs < Date.now()) {
        return res.json({ success: false, message: 'This invitation has expired.' }, 400);
      }
    }

    const teamId = String(doc.team_id || '').trim();
    let teamName = '';
    if (teams && teamId) {
      try {
        const t = await teams.get(teamId);
        teamName = String(t.name || '').trim();
      } catch {
        teamName = '';
      }
    }

    const email = String(doc.email || '')
      .trim()
      .toLowerCase();
    log(`users: team-invite-preview invite=${inviteId} team=${teamId}`);
    return res.json({
      success: true,
      teamId,
      teamName: teamName || 'Team',
      email,
      inviteId: doc.$id,
    });
  } catch (err) {
    error(`team-invite-preview: ${err.message}`);
    return res.json({ success: false, message: 'Invitation not found.' }, 404);
  }
};
