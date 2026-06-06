import sendTeamInviteEmail from './sendTeamInviteEmail.ts';
import resolveInviteAppOrigin from './resolveInviteAppOrigin.ts';
import { signTeamInviteToken } from './teamInviteToken.ts';

/**
 * Build signed URLs and send the team invite email for an existing `team_invites` row.
 *
 * @param {{ log: (s: string) => void; error?: (s: string) => void }} ctx
 * @param {{
 *   databases: import('node-appwrite').Databases;
 *   teams: import('node-appwrite').Teams;
 *   doc: Record<string, unknown>;
 *   payload: Record<string, unknown>;
 * }} p
 * @returns {Promise<{ ok: boolean; via: string; reviewUrl: string; acceptUrl: string; declineUrl: string }>}
 */
export default async function dispatchTeamInviteOutbound(ctx, p) {
  const { databases, teams, doc, payload } = p;
  const inviteId = String(doc.$id || '').trim();
  const email = String(doc.email || '')
    .trim()
    .toLowerCase();
  const teamId = String(doc.team_id || '').trim();
  if (!inviteId || !email || !teamId) {
    throw new Error('Invalid invite document.');
  }

  const origin = resolveInviteAppOrigin(payload);
  if (!origin) {
    throw new Error('Pass inviteBaseUrl or inviteUrl so invite links can be built.');
  }

  const token = signTeamInviteToken({
    inviteId,
    email,
    teamId,
    expires_at: doc.expires_at,
  });

  const q = `i=${encodeURIComponent(inviteId)}&t=${encodeURIComponent(token)}`;
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

  const emailDispatch = await sendTeamInviteEmail(ctx, {
    databases,
    toEmail: email,
    teamName: label,
    acceptUrl,
    declineUrl,
    reviewUrl,
  });

  return { ...emailDispatch, reviewUrl, acceptUrl, declineUrl };
};
