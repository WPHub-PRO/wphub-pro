import { callerUserIdFromReq } from '@code045/wphubpro-shared';
import { switchUserToWorkspaceIfNeeded } from '../../lib/teamHelpers.ts';

/**
 * Set `accounts.active_team_id` for the caller: `null` = personal workspace, or an Appwrite team they belong to.
 */
export default async function handleSetActiveTeam({ req, res, log, error }, ctx) {
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    return res.json({ success: false, message: 'Unauthorized: could not resolve caller user' }, 401);
  }

  const payload = req._parsedPayload || {};
  const raw = payload.activeTeamId ?? payload.active_team_id ?? payload.teamId ?? null;
  let nextTeamId = null;
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
    nextTeamId = String(raw).trim();
  }

  const { databases, teams, users } = ctx;
  if (!databases) {
    return res.json({ success: false, message: 'Server misconfiguration.' }, 500);
  }

  try {
    const sw = await switchUserToWorkspaceIfNeeded({
      databases,
      users,
      teams,
      sessionUserId: actor,
      targetTeamId: nextTeamId,
    });

    if (!sw.ok) {
      if (sw.code === 'no_account') {
        return res.json({ success: false, message: 'Account document not found.' }, 404);
      }
      if (sw.code === 'not_member') {
        return res.json({ success: false, message: sw.message }, 403);
      }
      return res.json({ success: false, message: sw.message }, 401);
    }

    if (sw.switched) {
      log(`users: set-active-team user=${actor} -> ${sw.activeTeamId ? `team=${sw.activeTeamId}` : 'personal'}`);
    }
    return res.json({ success: true, active_team_id: sw.activeTeamId });
  } catch (err) {
    error(`setActiveTeam: ${err.message}`);
    return res.json({ success: false, message: err.message || 'set-active-team failed' }, 400);
  }
};
