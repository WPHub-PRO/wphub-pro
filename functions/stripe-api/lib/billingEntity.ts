import { WPHUB_APPWRITE_IDS, listUserMemberships, userIsOwnerRoleOnTeam, Query } from '@code045/wphubpro-shared'
import { platformTeamsTableId } from '@code045/wphubpro-shared';
import { fetchPlatformAccountDoc } from './platformAccount.ts';
import { getStripeCustomerIdForUser, PREFS_KEY } from './appwritePrefs.ts';

function dbId() {
  return String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

/**
 * Personal Stripe customer: Auth prefs first, then `platform_db.accounts.stripe_customer_id`.
 * Optionally mirrors the id into prefs when it only existed on the account row.
 *
 * @param {import('node-appwrite').Databases} databases
 * @param {object} req
 * @param {string} userId
 * @param {import('node-appwrite').Users} [users]
 * @param {{ healPrefs?: boolean }} [options]
 * @returns {Promise<string | null>}
 */
async function resolvePersonalBillingCustomerId(databases, req, userId, users, options) {
  const healPrefs = options?.healPrefs !== false;
  let customerId = await getStripeCustomerIdForUser(userId, req);
  if (customerId && String(customerId).startsWith('cus_')) return customerId;
  try {
    const doc = await fetchPlatformAccountDoc(databases, userId);
    const accCid =
      doc && typeof doc.stripe_customer_id === 'string' ? String(doc.stripe_customer_id).trim() : '';
    if (!accCid.startsWith('cus_')) return null;
    customerId = accCid;
    if (
      healPrefs &&
      users &&
      typeof users.get === 'function' &&
      typeof users.updatePrefs === 'function'
    ) {
      try {
        const u = await users.get(userId);
        const prefs = u.prefs ?? {};
        const cur = prefs[PREFS_KEY];
        if (cur !== customerId) {
          await users.updatePrefs({
            userId,
            prefs: { ...prefs, [PREFS_KEY]: customerId },
          });
        }
      } catch (e) {
        console.warn('[resolvePersonalBillingCustomerId] prefs heal failed', e && e.message ? e.message : e);
      }
    }
    return customerId;
  } catch (e) {
    console.warn('[resolvePersonalBillingCustomerId] account read failed', e && e.message ? e.message : e);
    return null;
  }
}

/**
 * Resolve Stripe `customer` id for platform billing (personal `accounts`/prefs vs team `teams` row).
 *
 * @param {object} opts
 * @param {import('node-appwrite').Databases} opts.databases
 * @param {object} opts.req Appwrite request (for prefs-backed personal customer)
 * @param {string} opts.userId Appwrite auth user id (caller)
 * @param {Record<string, unknown>} opts.body Request body; optional `entityType` (`user`|`team`), `teamId` when team
 * @param {import('node-appwrite').Users} [opts.users] Appwrite Users API — team billing allows Appwrite `owner` role when `teams.owner_id` is stale
 * @returns {Promise<{ entityType: 'user' | 'team'; customerId: string; teamId?: string }>}
 */
async function resolveStripeBillingCustomer(opts) {
  const { databases, req, userId, body, users } = opts;
  const entityType = String(body?.entityType ?? 'user')
    .trim()
    .toLowerCase();
  if (entityType !== 'user' && entityType !== 'team') {
    throw Object.assign(new Error('Invalid entityType'), { statusCode: 400, code: 'BAD_REQUEST' });
  }

  if (entityType === 'user') {
    const customerId = await resolvePersonalBillingCustomerId(databases, req, userId, users, { healPrefs: true });
    if (!customerId || !String(customerId).startsWith('cus_')) {
      throw Object.assign(new Error('No Stripe customer for this account'), {
        statusCode: 400,
        code: 'NO_CUSTOMER',
      });
    }
    return { entityType: 'user', customerId };
  }

  const teamId = String(body?.teamId ?? body?.entityId ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
  if (!teamId) {
    throw Object.assign(new Error('teamId is required for team billing'), { statusCode: 400 });
  }

  const tColl = platformTeamsTableId();
  let row;
  try {
    row = await databases.getDocument(dbId(), tColl, teamId);
  } catch {
    throw Object.assign(new Error('Team not found'), { statusCode: 404 });
  }
  const ownerId = String(row.owner_id ?? '').trim();
  const uid = String(userId).trim();
  const rowOwnerMatches = Boolean(ownerId && ownerId === uid);
  let membershipOwner = false;
  if (users && typeof users.listMemberships === 'function') {
    try {
      const mems = await listUserMemberships(users, uid);
      membershipOwner = userIsOwnerRoleOnTeam(mems, teamId, uid);
    } catch {
      /* ignore */
    }
  }
  if (!rowOwnerMatches && !membershipOwner) {
    throw Object.assign(new Error('Forbidden: not team owner'), { statusCode: 403 });
  }
  const customerId = String(row.stripe_customer_id ?? '').trim();
  if (!customerId.startsWith('cus_')) {
    throw Object.assign(new Error('Team has no Stripe customer yet'), { statusCode: 400, code: 'NO_CUSTOMER' });
  }
  return { entityType: 'team', customerId, teamId };
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} userId
 * @param {string} teamId
 * @param {import('node-appwrite').Users} [users]
 * @returns {Promise<{ stripe_customer_id: string } | null>}
 */
async function getTeamStripeCustomerForOwner(databases, userId, teamId, users) {
  const tid = String(teamId || '').trim();
  if (!tid) return null;
  const tColl = platformTeamsTableId();
  const uid = String(userId).trim();
  try {
    const row = await databases.getDocument(dbId(), tColl, tid);
    const rowOwnerMatches = String(row.owner_id ?? '').trim() === uid;
    let membershipOwner = false;
    if (users && typeof users.listMemberships === 'function') {
      try {
        const mems = await listUserMemberships(users, uid);
        membershipOwner = userIsOwnerRoleOnTeam(mems, tid, uid);
      } catch {
        /* ignore */
      }
    }
    if (!rowOwnerMatches && !membershipOwner) return null;
    const cid = String(row.stripe_customer_id ?? '').trim();
    if (!cid.startsWith('cus_')) return null;
    return { stripe_customer_id: cid };
  } catch {
    return null;
  }
}

/**
 * Personal prefs customer or team `stripe_customer_id` row owned by `userId`.
 *
 * @param {object} opts
 * @param {import('node-appwrite').Databases} opts.databases
 * @param {object} opts.req
 * @param {string} opts.userId
 * @param {string} opts.customerId
 * @param {import('node-appwrite').Users} [opts.users]
 */
async function assertCustomerOrTeamStripeAccess(opts) {
  const { databases, req, userId, customerId, users } = opts;
  const cid = String(customerId ?? '').trim();
  if (!cid.startsWith('cus_')) {
    throw Object.assign(new Error('Invalid customer id'), { statusCode: 400 });
  }
  const personal = await resolvePersonalBillingCustomerId(databases, req, userId, users, { healPrefs: false });
  if (personal && personal === cid) return;

  const tColl = platformTeamsTableId();
  const rows = await databases.listDocuments(dbId(), tColl, [
    Query.equal('stripe_customer_id', cid),
    Query.limit(2),
  ]);
  const row = rows.documents?.[0];
  if (!row) {
    throw Object.assign(new Error('Forbidden: customer does not belong to this user'), { statusCode: 403 });
  }
  const tid = String(row.$id ?? '').trim();
  const ownerId = String(row?.owner_id ?? '').trim();
  const uid = String(userId).trim();
  const rowOwnerMatches = Boolean(ownerId && ownerId === uid);
  let membershipOwner = false;
  if (users && typeof users.listMemberships === 'function' && tid) {
    try {
      const mems = await listUserMemberships(users, uid);
      membershipOwner = userIsOwnerRoleOnTeam(mems, tid, uid);
    } catch {
      /* ignore */
    }
  }
  if (!rowOwnerMatches && !membershipOwner) {
    throw Object.assign(new Error('Forbidden: customer does not belong to this user'), { statusCode: 403 });
  }
}

export {
  resolveStripeBillingCustomer,
  getTeamStripeCustomerForOwner,
  assertCustomerOrTeamStripeAccess,
};