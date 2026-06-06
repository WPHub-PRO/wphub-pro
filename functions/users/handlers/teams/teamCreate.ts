import { callerUserIdFromReq, ID, Permission, Role } from '@code045/wphubpro-shared'
import platformTeamsTableId from '../../lib/platformTeamsTableId.ts';
import { getAccountByUserId, dbId, accountsColl } from '../../lib/teamHelpers.ts';

/**
 * Create an Appwrite team for the caller and set `active_team_id` on the platform account.
 * Also creates a `teams` metadata row (`$id` === team id) when the table exists.
 */
export default async function handleTeamCreate({ req, res, log, error }, ctx) {
  const payload = req._parsedPayload || {};
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    return res.json({ success: false, message: 'Unauthorized: could not resolve caller user' }, 401);
  }

  const name = String(payload.name ?? payload.teamName ?? '').trim();
  if (!name || name.length > 128) {
    return res.json({ success: false, message: 'Team name is required (max 128 chars).' }, 400);
  }

  const { databases, teams } = ctx;
  if (!teams) {
    error('teamCreate: teams service missing');
    return res.json({ success: false, message: 'Server misconfiguration.' }, 500);
  }

  try {
    const teamId = ID.unique();
    const createdTeam = await teams.create({ teamId, name });
    const tid = createdTeam.$id;

    await teams.createMembership({
      teamId: tid,
      userId: actor,
      roles: ['owner'],
    });

    const tColl = platformTeamsTableId();
    try {
      const perms = [
        Permission.read(Role.team(tid)),
        Permission.update(Role.team(tid, ['owner'])),
        Permission.delete(Role.team(tid, ['owner'])),
      ];
      await databases.createDocument(dbId(), tColl, ID.custom(tid), {
        owner_id: actor,
        max_seats: 1,
        stripe_customer_id: '',
        stripe_subscription_id: '',
      }, perms);
    } catch (e) {
      log(`teamCreate: teams metadata row: ${e.message}`);
    }

    const acc = await getAccountByUserId(databases, actor);
    const patch = {
      active_team_id: tid,
    };

    if (acc && acc.$id) {
      await databases.updateDocument(dbId(), accountsColl(), acc.$id, patch);
    } else {
      await databases.createDocument(dbId(), accountsColl(), ID.unique(), {
        user_id: actor,
        ...patch,
      });
    }

    log(`users: teamCreate team=${tid} owner=${actor}`);
    return res.json({ success: true, team: { $id: tid, name: createdTeam.name } });
  } catch (err) {
    error(`teamCreate: ${err.message}`);
    return res.json({ success: false, message: err.message || 'teamCreate failed' }, 400);
  }
};
