import { sendUserNotificationFromTemplate } from '@code045/wphubpro-shared';

/**
 * In-app notification for the team owner using notification_templates.team_invite_user.
 *
 * @param {import('node-appwrite').Databases} databases
 * @param {{ ownerUserId: string; title?: string; body?: string; metadata?: unknown; users?: import('node-appwrite').Users }} p
 */
export default async function notifyTeamInviteOwner(databases, p) {
  const uid = String(p.ownerUserId || '').trim();
  if (!uid) return;
  const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
  const teamName = String(meta.team_name || '').trim();
  const teamId = String(meta.team_id || meta.teamId || '').trim();
  const inviteeEmail = String(meta.email || '').trim();
  const outcome = String(meta.outcome || '').trim();
  const summaryLine = String(p.body || `${inviteeEmail} — ${outcome}`).trim();
  await sendUserNotificationFromTemplate(databases, {
    eventKey: 'team_invite_user',
    recipientUserId: uid,
    users: p.users,
    teamId: teamId || null,
    payload: {
      team_name: teamName || 'your team',
      team_id: teamId || undefined,
      invitee_email: inviteeEmail,
      outcome: outcome || 'updated',
      summary_line: summaryLine,
    },
  });
};
