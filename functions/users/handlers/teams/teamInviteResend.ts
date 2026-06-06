import { callerUserIdFromReq } from '@code045/wphubpro-shared';
import teamInvitesColl from '../../lib/teamInvitesColl.ts';
import resolveInviteAppOrigin from '../../lib/resolveInviteAppOrigin.ts';
import dispatchTeamInviteOutbound from '../../lib/dispatchTeamInviteOutbound.ts';
import { inviteSecret, canonicalExpiresForSigning } from '../../lib/teamInviteToken.ts';
import { dbId, userHasTeamOwnerRole } from '../../lib/teamHelpers.ts';

/** Minimum seconds between resend attempts for the same invite (429 if faster). */
const RESEND_COOLDOWN_SEC = 45;

function parseAppwriteDate(raw) {
  if (raw == null || raw === '') return null;
  try {
    const d = raw instanceof Date ? raw : new Date(typeof raw === 'string' ? raw.trim() : raw);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

/**
 * Owner-only: refresh expiry and re-send the invite email for a pending row.
 */
export default async function handleTeamInviteResend({ req, res, log, error }, ctx) {
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    return res.json({ success: false, message: 'Unauthorized: could not resolve caller user' }, 401);
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

  if (!inviteSecret()) {
    return res.json(
      {
        success: false,
        message:
          'Server is not configured for secure invites. Add WPHUB_TEAM_INVITE_SECRET to the users function.',
      },
      503,
    );
  }

  const originProbe = resolveInviteAppOrigin(payload);
  if (!originProbe) {
    return res.json(
      {
        success: false,
        message:
          'Pass inviteBaseUrl (e.g. https://app.example.com) or inviteUrl so invite links can be built.',
      },
      400,
    );
  }

  try {
    const okOwner = await userHasTeamOwnerRole(teams, teamId, actor);
    if (!okOwner) {
      return res.json({ success: false, message: 'Only a team owner can resend invites.' }, 403);
    }

    let doc = await databases.getDocument(dbId(), teamInvitesColl(), inviteId);
    const docTeam = String(doc.team_id || '').trim();
    if (docTeam !== teamId) {
      return res.json({ success: false, message: 'Invite does not belong to this team.' }, 400);
    }
    const st = String(doc.status || 'pending').trim().toLowerCase();
    if (st !== 'pending') {
      return res.json({ success: false, message: 'Only pending invites can be resent.' }, 400);
    }

    const createdAtMs = parseAppwriteDate(doc.$createdAt);
    const updatedAtMs = parseAppwriteDate(doc.$updatedAt);
    const rowWasUpdatedAfterCreate =
      createdAtMs != null && updatedAtMs != null && updatedAtMs - createdAtMs > 1500;
    if (
      rowWasUpdatedAfterCreate &&
      updatedAtMs != null &&
      Date.now() - updatedAtMs < RESEND_COOLDOWN_SEC * 1000
    ) {
      return res.json(
        {
          success: false,
          message: `Please wait ${RESEND_COOLDOWN_SEC}s before resending this invite.`,
          retryAfterSec: RESEND_COOLDOWN_SEC,
        },
        429,
      );
    }

    const newExpires = canonicalExpiresForSigning(new Date(Date.now() + 14 * 86400000));
    doc = await databases.updateDocument(dbId(), teamInvitesColl(), inviteId, {
      expires_at: newExpires,
    });

    const emailDispatch = await dispatchTeamInviteOutbound({ log, error }, {
      databases,
      teams,
      doc,
      payload,
    });

    log(
      `users: team-invite-resend invite=${inviteId} team=${teamId} emailVia=${emailDispatch.via} actor=${actor}`,
    );

    return res.json({
      success: true,
      emailDispatched: emailDispatch.ok,
      inviteLandingUrl: emailDispatch.reviewUrl,
      message: emailDispatch.ok
        ? 'Invitation email sent.'
        : 'Invite updated but email could not be sent. Configure delivery or share inviteLandingUrl.',
    });
  } catch (err) {
    error(`teamInviteResend: ${err.message}`);
    return res.json({ success: false, message: err.message || 'teamInviteResend failed' }, 400);
  }
};
