import { callerUserIdFromReq, membershipCountsForHub, listUserMemberships, userHasConfirmedMembershipInTeam, platformTeamsTableId, Query, ID } from '@code045/wphubpro-shared';
import { getAccountByUserId, workspaceRoleForUser, dbId, accountsColl, userHasTeamOwnerRole } from '../../lib/teamHelpers.ts';

/**
 * Legacy fallback when membership API lags: `accounts.active_team_id` matches requested team.
 * (Same as `functions-lib` `accountActiveTeamMatchesTeam`; inlined for older published `functions-lib`.)
 *
 * @param {Record<string, unknown> | null | undefined} acc
 * @param {string} requestedTeamId
 */
function accountActiveTeamMatchesTeam(acc, requestedTeamId) {
  if (!acc || typeof acc !== 'object') return false;
  const tid = String(requestedTeamId || '').trim();
  if (!tid) return false;
  return String(acc.active_team_id || '').trim() === tid;
}

/**
 * Ensure `platform_db.accounts` row exists for the Appwrite user (no `account_kind` / `team_id`).
 *
 * @param {object} p
 * @param {import('node-appwrite').Databases} p.databases
 * @param {string} p.actor
 */
async function ensurePlatformAccountRow(p) {
  const { databases, actor } = p;
  let acc = await getAccountByUserId(databases, actor);
  if (!acc) {
    try {
      acc = await databases.createDocument(dbId(), accountsColl(), ID.unique(), {
        user_id: actor,
      });
    } catch {
      return;
    }
  }
}

/**
 * Pick a default team id from memberships + optional `active_team_id`.
 * @param {import('node-appwrite').Users} users
 * @param {string} actor
 * @param {Record<string, unknown> | null} acc
 */
async function pickDefaultTeamId(users, actor, acc) {
  const mems = await listUserMemberships(users, actor);
  const active = String(acc?.active_team_id || '').trim();
  if (active && userHasConfirmedMembershipInTeam(mems, active, actor)) return active;
  for (const m of mems) {
    if (!membershipCountsForHub(m, actor)) continue;
    const tid = String(m.teamId || '').trim();
    if (!tid) continue;
    const roles = (m.roles || []).map((r) => String(r).toLowerCase());
    if (roles.includes('owner')) return tid;
  }
  for (const m of mems) {
    if (!membershipCountsForHub(m, actor)) continue;
    const tid = String(m.teamId || '').trim();
    if (tid) return tid;
  }
  return '';
}

/**
 * Team info + members for the caller's team (owner or member).
 */
export default async function handleTeamGet({ req, res, error }, ctx) {
  const actor = callerUserIdFromReq(req);
  if (!actor) {
    return res.json({ success: false, message: 'Unauthorized: could not resolve caller user' }, 401);
  }

  const { databases, teams, users } = ctx;
  if (!teams || !users) {
    return res.json({ success: false, message: 'Server misconfiguration.' }, 500);
  }

  try {
    await ensurePlatformAccountRow({ databases, actor });
    const acc = await getAccountByUserId(databases, actor);
    const payload = req._parsedPayload || {};
    const requestedTeamId = String(payload.teamId ?? payload.team_id ?? '').trim();

    let teamId = '';
    let ownerUserId = actor;

    if (requestedTeamId) {
      const verify = await teams.listMemberships({
        teamId: requestedTeamId,
        queries: [Query.equal('userId', actor)],
      });
      const mine = verify.memberships?.[0];
      const okMember = mine && membershipCountsForHub(mine, actor);
      const okAccount = accountActiveTeamMatchesTeam(acc, requestedTeamId);
      if (!okMember && !okAccount) {
        return res.json({ success: false, message: 'Not a member of this team.' }, 403);
      }
      teamId = requestedTeamId;
      const teamsCollEarly = platformTeamsTableId();
      try {
        const row = await databases.getDocument(dbId(), teamsCollEarly, teamId);
        if (row?.owner_id) ownerUserId = String(row.owner_id).trim();
      } catch {
        /* ignore */
      }
    } else {
      teamId = await pickDefaultTeamId(users, actor, acc);
      ownerUserId = actor;
      if (teamId) {
        const teamsCollEarly = platformTeamsTableId();
        try {
          const row = await databases.getDocument(dbId(), teamsCollEarly, teamId);
          if (row?.owner_id) ownerUserId = String(row.owner_id).trim();
        } catch {
          /* ignore */
        }
      }
    }

    const k = await workspaceRoleForUser(users, databases, actor, acc, teamId || undefined);

    if (!teamId) {
      return res.json({
        success: true,
        team: null,
        members: [],
        role: k || 'individual',
        accountKind: k || 'individual',
        isOwner: false,
        seatsUsed: 0,
        seatTotal: null,
      });
    }

    const team = await teams.get({ teamId });
    const memList = await teams.listMemberships({ teamId });
    const memberships = memList.memberships || [];

    const members = [];
    for (const m of memberships) {
      const uid = m.userId;
      if (!uid) continue;
      let email = '';
      let name = '';
      try {
        const u = await users.get(uid);
        email = u.email || '';
        name = u.name || '';
      } catch {
        /* ignore */
      }
      members.push({
        membershipId: m.$id,
        userId: uid,
        email,
        name,
        roles: m.roles || [],
        confirmed: m.confirmed,
      });
    }

    const seatsUsed = members.length;

    let maxSeatsFromTable = null;
    let stripeCustomerIdTeam = null;
    let stripeSubscriptionId = null;
    /** @type {import('node-appwrite').Models.Document | null} */
    let platformTeamRow = null;
    const teamsColl = platformTeamsTableId();
    try {
      const row = await databases.getDocument(dbId(), teamsColl, teamId);
      platformTeamRow = row || null;
      if (row) {
        if (row.max_seats != null && Number.isFinite(Number(row.max_seats))) {
          maxSeatsFromTable = Number(row.max_seats);
        }
        if (row.stripe_customer_id) {
          stripeCustomerIdTeam = String(row.stripe_customer_id).trim();
        }
        if (row.stripe_subscription_id) {
          stripeSubscriptionId = String(row.stripe_subscription_id).trim();
        }
      }
    } catch {
      /* no row or table missing */
    }

    const seatTotal =
      maxSeatsFromTable != null && maxSeatsFromTable > 0 ? maxSeatsFromTable : null;

    let isOwner = await userHasTeamOwnerRole(teams, teamId, actor);
    if (
      !isOwner &&
      platformTeamRow &&
      String(platformTeamRow.owner_id || '').trim() === String(actor).trim()
    ) {
      isOwner = true;
    }

    /** Billing / subscription capacity: owners only (API truth for clients). */
    const billingForOwner = isOwner
      ? {
          seatPurchased: seatTotal,
          seatTotal,
          stripeCustomerIdTeam: stripeCustomerIdTeam || null,
          stripeSubscriptionId: stripeSubscriptionId || null,
        }
      : {
          seatPurchased: null,
          seatTotal: null,
          stripeCustomerIdTeam: null,
          stripeSubscriptionId: null,
        };

    return res.json({
      success: true,
      team: { $id: team.$id, name: team.name },
      members,
      role: k,
      accountKind: k,
      ownerUserId: k === 'team_member' ? ownerUserId : actor,
      seatsUsed,
      isOwner,
      ...billingForOwner,
    });
  } catch (err) {
    error(`teamGet: ${err.message}`);
    return res.json({ success: false, message: err.message || 'teamGet failed' }, 400);
  }
};
