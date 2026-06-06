import { callerUserIdFromReq } from '@code045/wphubpro-shared';
import platformTeamsTableId from '../../lib/platformTeamsTableId.ts';
import { getAccountByUserId, userHasTeamOwnerRole, dbId, accountsColl } from '../../lib/teamHelpers.ts';
import { cancelTeamSubscriptionImmediately } from '../../lib/cancelTeamSubscriptionImmediately.ts';

/**
 * Owner-only: cancel Stripe subscription immediately (when present) via **stripe-api**
 * (`/internal/team-subscription/cancel`), clear members' `active_team_id`,
 * delete the Appwrite team, then remove the platform `teams` row.
 *
 * Subscription lifecycle on `teams` is also updated by Stripe webhooks — see
 * `functions/stripe-api/handlers/stripeWebhook.js` (`syncTeamRowFromSubscription`).
 *
 * Clearing many members' `active_team_id` may benefit from a DB index on `accounts.active_team_id` at scale.
 */
export default async function handleTeamDelete({ req, res, log, error }, ctx) {
  const payload = req._parsedPayload || {};
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    return res.json({ success: false, message: 'Unauthorized: could not resolve caller user' }, 401);
  }

  const teamId = String(payload.teamId ?? payload.team_id ?? '').trim();
  if (!teamId) {
    return res.json({ success: false, message: 'teamId is required.' }, 400);
  }

  const { databases, teams } = ctx;
  if (!teams) {
    return res.json({ success: false, message: 'Server misconfiguration.' }, 500);
  }

  const teamsColl = platformTeamsTableId();

  try {
    /** @type {import('node-appwrite').Models.Document | null} */
    let row = null;
    try {
      row = await databases.getDocument(dbId(), teamsColl, teamId);
    } catch {
      return res.json({ success: false, message: 'Team metadata not found.' }, 404);
    }

    const platformOwner = String(row.owner_id || '').trim();
    if (!platformOwner || platformOwner !== actor) {
      return res.json({ success: false, message: 'Only the team owner can delete this team.' }, 403);
    }

    const actorIsAppwriteOwner = await userHasTeamOwnerRole(teams, teamId, actor);
    if (!actorIsAppwriteOwner) {
      return res.json(
        { success: false, message: 'Owner metadata does not match Appwrite roles; contact support.' },
        403,
      );
    }

    const subId = row.stripe_subscription_id != null ? String(row.stripe_subscription_id).trim() : '';
    try {
      await cancelTeamSubscriptionImmediately({ teamId, subscriptionId: subId, req });
    } catch (e) {
      const sc = e && typeof e.statusCode === 'number' ? e.statusCode : 500;
      error(`teamDelete: stripe cancel ${e.message}`);
      return res.json(
        { success: false, message: e.message || 'Could not cancel team subscription in Stripe.' },
        sc,
      );
    }

    const memList = await teams.listMemberships({ teamId });
    for (const m of memList.memberships || []) {
      const uid = m.userId;
      if (!uid) continue;
      try {
        const acc = await getAccountByUserId(databases, uid);
        if (acc && acc.$id && String(acc.active_team_id || '').trim() === teamId) {
          await databases.updateDocument(dbId(), accountsColl(), acc.$id, { active_team_id: null });
        }
      } catch (e) {
        log(`teamDelete: clear active_team_id for ${uid}: ${e.message}`);
      }
    }

    await teams.delete({ teamId });

    try {
      await databases.deleteDocument(dbId(), teamsColl, teamId);
    } catch (e) {
      log(`teamDelete: delete platform row ${e.message}`);
    }

    log(`users: teamDelete team=${teamId} by=${actor}`);
    return res.json({ success: true });
  } catch (err) {
    error(`teamDelete: ${err.message}`);
    return res.json({ success: false, message: err.message || 'teamDelete failed' }, 400);
  }
};
