import { callerUserIdFromReq, listUserMemberships, userHasConfirmedMembershipInTeam, Query, ID } from '@code045/wphubpro-shared';
import { sendUserNotificationFromTemplate } from '@code045/wphubpro-shared';
import platformTeamsTableId from '../../lib/platformTeamsTableId.ts';
import teamInvitesColl from '../../lib/teamInvitesColl.ts';
import resolveInviteAppOrigin from '../../lib/resolveInviteAppOrigin.ts';
import sendTeamInviteEmail from '../../lib/sendTeamInviteEmail.ts';
import { signTeamInviteToken, inviteSecret, canonicalExpiresForSigning } from '../../lib/teamInviteToken.ts';
import { userHasTeamOwnerRole, dbId, firstOwnedPlatformTeamId } from '../../lib/teamHelpers.ts';

/**
 * Owner invites by email: always creates a pending `team_invites` row + outbound email (existing and new addresses).
 * Membership is created only via team-invite-claim after the invitee accepts.
 */
export default async function handleTeamInvite({ req, res, log, error }, ctx) {
  const payload = req._parsedPayload || {};
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    return res.json({ success: false, message: 'Unauthorized: could not resolve caller user' }, 401);
  }

  const email = String(payload.email ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return res.json({ success: false, message: 'Valid email is required.' }, 400);
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
      return res.json({ success: false, message: 'Only a team owner can invite members.' }, 403);
    }

    let maxSeats = 99;
    const teamsColl = platformTeamsTableId();
    try {
      const teamRow = await databases.getDocument(dbId(), teamsColl, teamId);
      const fromTable =
        teamRow && teamRow.max_seats != null && Number.isFinite(Number(teamRow.max_seats))
          ? Number(teamRow.max_seats)
          : null;
      if (fromTable != null && fromTable > 0) {
        maxSeats = fromTable;
      }
    } catch {
      /* no platform row — keep default cap */
    }

    const memList = await teams.listMemberships({ teamId });
    const joined = (memList.memberships || []).filter((m) => m.confirmed === true || m.joined === true);
    let pendingInvites = 0;
    try {
      const pi = await databases.listDocuments(dbId(), teamInvitesColl(), [
        Query.equal('team_id', teamId),
        Query.limit(100),
      ]);
      pendingInvites = (pi.documents || []).filter(
        (d) => String(d.status || 'pending').toLowerCase() === 'pending',
      ).length;
    } catch {
      pendingInvites = 0;
    }
    if (joined.length + pendingInvites >= maxSeats) {
      try {
        let ownerId = '';
        try {
          const row = await databases.getDocument(dbId(), teamsColl, teamId);
          ownerId = String(row.owner_id || '').trim();
        } catch {
          ownerId = '';
        }
        if (ownerId) {
          await sendUserNotificationFromTemplate(databases, {
            eventKey: 'limit_reached',
            recipientUserId: ownerId,
            users,
            payload: {
              detail: `Seat limit reached (${maxSeats}). Invite blocked.`,
              max_seats: String(maxSeats),
              team_id: teamId,
            },
          });
        }
      } catch {
        /* best-effort notify */
      }
      return res.json(
        { success: false, message: `Seat limit reached (${maxSeats}). Upgrade your team plan to add more seats.` },
        400,
      );
    }

    const list = await users.list({
      queries: [Query.equal('email', email), Query.limit(5)],
    });
    const invitee = (list.users || []).find((u) => String(u.email || '').toLowerCase() === email);

    if (invitee) {
      if (invitee.$id === actor) {
        return res.json({ success: false, message: 'You cannot invite yourself.' }, 400);
      }

      const targetMems = await listUserMemberships(users, invitee.$id);
      if (userHasConfirmedMembershipInTeam(targetMems, teamId, invitee.$id)) {
        return res.json({ success: false, message: 'User is already a member of this team.' }, 400);
      }
    }

    if (!inviteSecret()) {
      return res.json(
        {
          success: false,
          message:
            'Server is not configured for secure invites. In Appwrite Console open Functions → users → Variables and add WPHUB_TEAM_INVITE_SECRET (a long random string; generate locally with: openssl rand -hex 32). Save and ensure the latest deployment is active.',
        },
        503,
      );
    }
    const origin = resolveInviteAppOrigin(payload);
    if (!origin) {
      return res.json(
        {
          success: false,
          message:
            'Pass inviteBaseUrl (e.g. https://app.example.com) or inviteUrl (https…) so invite links can be built.',
        },
        400,
      );
    }

    const existingRows = await databases.listDocuments(dbId(), teamInvitesColl(), [
      Query.equal('team_id', teamId),
      Query.equal('email', email),
      Query.limit(25),
    ]);
    for (const row of existingRows.documents || []) {
      try {
        await databases.deleteDocument(dbId(), teamInvitesColl(), row.$id);
      } catch {
        /* ignore */
      }
    }

    const expiresAt = canonicalExpiresForSigning(new Date(Date.now() + 14 * 86400000));
    const created = await databases.createDocument(dbId(), teamInvitesColl(), ID.unique(), {
      email,
      team_id: teamId,
      invited_by_user_id: actor,
      expires_at: expiresAt,
      status: 'pending',
    });

    const token = signTeamInviteToken({
      inviteId: created.$id,
      email,
      teamId,
      expires_at: created.expires_at != null ? created.expires_at : expiresAt,
    });

    const q = `i=${encodeURIComponent(created.$id)}&t=${encodeURIComponent(token)}`;
    const reviewUrl = `${origin}/invite/team?${q}`;
    const acceptUrl = `${origin}/register/invite?${q}`;
    const declineUrl = `${origin}/invite/team?${q}&d=1`;

    let teamName = '';
    try {
      const t = await teams.get(teamId);
      teamName = String(t.name || '').trim();
    } catch {
      teamName = '';
    }
    const label = teamName || 'a team';

    let emailDispatch = { ok: false, via: 'none' };
    try {
      emailDispatch = await sendTeamInviteEmail(
        { log, error },
        {
          databases,
          toEmail: email,
          teamName: label,
          acceptUrl,
          declineUrl,
          reviewUrl,
        },
      );
    } catch (e) {
      error(`teamInvite email: ${e.message}`);
      try {
        await databases.deleteDocument(dbId(), teamInvitesColl(), created.$id);
      } catch {
        /* ignore */
      }
      return res.json({ success: false, message: `Could not send invite email: ${e.message}` }, 502);
    }

    const inviteeUserId = invitee ? String(invitee.$id || '').trim() : '';
    if (inviteeUserId) {
      try {
        let invitedByEmail = '';
        let invitedByName = '';
        try {
          const inviter = await users.get(actor);
          invitedByEmail = String(inviter.email || '').trim();
          invitedByName = String(inviter.name || '').trim();
        } catch {
          invitedByEmail = '';
          invitedByName = '';
        }
        const summaryLine =
          invitedByEmail.trim().length > 0
            ? `${invitedByEmail} invited you to join ${label}. Use the buttons below or the email link to respond.`
            : `You were invited to join ${label}. Use the buttons below or the email link to respond.`;
        await sendUserNotificationFromTemplate(databases, {
          eventKey: 'team_invite_existing_user',
          recipientUserId: inviteeUserId,
          users,
          payload: {
            team_name: label,
            team_id: teamId,
            invite_id: created.$id,
            invite_token: token,
            invited_by_email: invitedByEmail,
            invited_by_name: invitedByName || invitedByEmail || 'A teammate',
            summary_line: summaryLine,
            accept_cta: 'Accept invitation',
            decline_cta: 'Decline invitation',
          },
          createdByUserId: actor,
        });
      } catch {
        /* best-effort notify */
      }
    }

    log(
      `users: teamInvite stored invite=${created.$id} team=${teamId} email=${email} existingUser=${inviteeUserId || 'none'} emailVia=${emailDispatch.via}`,
    );
    return res.json({
      success: true,
      pending: true,
      email,
      ...(inviteeUserId ? { userId: inviteeUserId } : {}),
      inviteId: created.$id,
      emailDispatched: emailDispatch.ok,
      inviteLandingUrl: reviewUrl,
      acceptUrl,
      declineUrl,
      message: emailDispatch.ok
        ? 'Invitation email sent with Accept and Decline actions.'
        : 'Invite saved. Configure email delivery (Resend or webhook) in Admin → Platform settings → Communication, set WPHUB_TEAM_INVITE_EMAIL_WEBHOOK, or share inviteLandingUrl with the invitee.',
    });
  } catch (err) {
    error(`teamInvite: ${err.message}`);
    return res.json({ success: false, message: err.message || 'teamInvite failed' }, 400);
  }
};
