import platformTeamsTableId from '../../lib/platformTeamsTableId.ts';
import { dbId } from '../../lib/teamHelpers.ts';

/**
 * Admin: single team metadata + Appwrite team + membership count.
 */
export default async function handleAdminTeamGet({ req, res, error }, ctx) {
  const payload = req._parsedPayload || {};
  const teamId = String(payload.teamId ?? payload.team_id ?? '').trim();
  if (!teamId) {
    return res.json({ success: false, message: 'teamId is required.' }, 400);
  }

  const teamsColl = platformTeamsTableId();
  const { databases, teams } = ctx;
  if (!teams) {
    return res.json({ success: false, message: 'Server misconfiguration.' }, 500);
  }

  try {
    let row = null;
    try {
      row = await databases.getDocument(dbId(), teamsColl, teamId);
    } catch {
      row = null;
    }

    let teamName = '';
    let memberCount = 0;
    try {
      const t = await teams.get({ teamId });
      teamName = t.name || '';
      const memList = await teams.listMemberships({ teamId });
      memberCount = (memList.memberships || []).length;
    } catch {
      /* */
    }

    return res.json({
      success: true,
      teamId,
      teamName,
      memberCount,
      row: row
        ? {
            teamId: row.$id,
            ownerId: row.owner_id ?? '',
            maxSeats: row.max_seats,
            stripeCustomerId: row.stripe_customer_id ?? '',
            stripeSubscriptionId: row.stripe_subscription_id ?? '',
            $createdAt: row.$createdAt,
          }
        : null,
    });
  } catch (err) {
    error(`adminTeamGet: ${err.message}`);
    return res.json({ success: false, message: err.message || 'adminTeamGet failed' }, 400);
  }
};
