import platformTeamsTableId from '../../lib/platformTeamsTableId.ts';
import { dbId } from '../../lib/teamHelpers.ts';

/**
 * Admin: correct `teams.max_seats` (seat cap lives on the platform `teams` row only).
 */
export default async function handleAdminTeamPatch({ req, res, error }, ctx) {
  const payload = req._parsedPayload || {};
  const teamId = String(payload.teamId ?? payload.team_id ?? '').trim();
  const maxSeats = Math.max(1, Math.min(999, Number(payload.maxSeats ?? payload.max_seats) || 0));
  if (!teamId) {
    return res.json({ success: false, message: 'teamId is required.' }, 400);
  }
  if (!maxSeats) {
    return res.json({ success: false, message: 'maxSeats must be between 1 and 999.' }, 400);
  }

  const teamsColl = platformTeamsTableId();

  const { databases } = ctx;

  try {
    await databases.updateDocument(dbId(), teamsColl, teamId, { max_seats: maxSeats });

    return res.json({ success: true, teamId, maxSeats });
  } catch (err) {
    error(`adminTeamPatch: ${err.message}`);
    return res.json({ success: false, message: err.message || 'adminTeamPatch failed' }, 400);
  }
};
