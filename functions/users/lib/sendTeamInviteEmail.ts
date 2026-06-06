import {
  renderSystemEmail,
  sendTransactionalEmail,
  getPlatformSettingJson,
} from '@code045/wphubpro-shared';

if (typeof renderSystemEmail !== 'function') {
  throw new Error(
    'functions-lib is outdated: renderSystemEmail missing. Push current repo (systemEmail.js + index exports), run npm install in functions/users, redeploy.'
  );
}
if (typeof sendTransactionalEmail !== 'function') {
  throw new Error(
    'functions-lib is outdated: sendTransactionalEmail missing. Push current repo, npm install in functions/users, redeploy.'
  );
}
if (typeof getPlatformSettingJson !== 'function') {
  throw new Error(
    'functions-lib is outdated: getPlatformSettingJson missing. Push current repo, npm install in functions/users, redeploy.'
  );
}

/**
 * Team invite outbound mail: render `team_invite` system template + send via Resend or webhook
 * (`email_delivery` in platform_settings, env fallbacks).
 *
 * @param {{ log: (s: string) => void; error?: (s: string) => void }} ctx
 * @param {{
 *   databases: import('node-appwrite').Databases;
 *   toEmail: string;
 *   teamName: string;
 *   acceptUrl: string;
 *   declineUrl: string;
 *   reviewUrl: string;
 * }} p
 * @returns {Promise<{ ok: boolean; via: string }>}
 */
export default async function sendTeamInviteEmail(ctx, p) {
  const toEmail = String(p.toEmail || '')
    .trim()
    .toLowerCase();
  if (!toEmail) {
    ctx.log('sendTeamInviteEmail: missing toEmail');
    return { ok: false, via: 'skipped' };
  }

  let platform_title = 'WP Hub Pro';
  try {
    const branding = await getPlatformSettingJson(p.databases, 'platform_branding');
    const t =
      branding &&
      typeof branding === 'object' &&
      branding.platformTitle != null &&
      String(branding.platformTitle).trim();
    if (t) platform_title = String(branding.platformTitle).trim();
  } catch {
    /* ignore */
  }

  const teamName = String(p.teamName || '').trim() || 'a team';
  const context = {
    team_name: teamName,
    platform_title,
    invite_accept_url: String(p.acceptUrl || ''),
    invite_decline_url: String(p.declineUrl || ''),
    invite_review_url: String(p.reviewUrl || ''),
    user_email: toEmail,
  };

  let rendered;
  try {
    rendered = await renderSystemEmail(p.databases, 'team_invite', context);
  } catch (e) {
    ctx.log(`sendTeamInviteEmail render: ${e.message}`);
    throw e;
  }

  return sendTransactionalEmail({
    databases: p.databases,
    log: ctx.log,
    to: toEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });
};
