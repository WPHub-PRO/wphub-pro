import * as crypto from 'node:crypto';
import { WPHUB_APPWRITE_IDS, platformTeamsTableId } from '@code045/wphubpro-shared';
import adminOps from './adminSubscriptionOps.ts';

/**
 * Immediate cancel for a team-owned subscription (server-to-server from `users` team delete).
 *
 * **Auth:** header `X-WPHUB-Internal-Key` must equal env **`WPHUB_INTERNAL_FUNCTION_KEY`**
 * (configure the same secret on **stripe-api** and **users**; never commit values).
 *
 * **Body:** `{ teamId, subscriptionId }` — must match `platform_db.teams.stripe_subscription_id`
 * for that document (Appwrite admin client).
 */
function internalKeyFromReq(req) {
  if (!req || typeof req !== 'object' || !req.headers || typeof req.headers !== 'object') return '';
  for (const [k, v] of Object.entries(req.headers)) {
    if (String(k).toLowerCase() !== 'x-wphub-internal-key') continue;
    if (v == null) return '';
    return Array.isArray(v) ? String(v[0]).trim() : String(v).trim();
  }
  return '';
}

function timingSafeEqualStrings(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function dbId() {
  return String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

/**
 * @param {{ req: object; databases: import('node-appwrite').Databases; body: unknown }} ctx
 */
async function internalTeamSubscriptionCancel(ctx) {
  const { req, databases, body } = ctx;
  const expected = String(process.env.WPHUB_INTERNAL_FUNCTION_KEY || '').trim();
  if (!expected) {
    throw Object.assign(new Error('WPHUB_INTERNAL_FUNCTION_KEY is not configured on stripe-api'), {
      statusCode: 503,
    });
  }
  const provided = internalKeyFromReq(req);
  if (!provided || !timingSafeEqualStrings(provided, expected)) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  }

  const b = body && typeof body === 'object' ? /** @type {Record<string, unknown>} */ (body) : {};
  const teamId = String(b.teamId ?? b.team_id ?? '').trim();
  const subscriptionId = String(b.subscriptionId ?? b.subscription_id ?? '').trim();
  if (!teamId || !subscriptionId) {
    throw Object.assign(new Error('teamId and subscriptionId are required'), { statusCode: 400 });
  }
  if (!subscriptionId.startsWith('sub_')) {
    return { success: true, skipped: true };
  }

  const teamsColl = platformTeamsTableId();
  let row;
  try {
    row = await databases.getDocument(dbId(), teamsColl, teamId);
  } catch {
    throw Object.assign(new Error('Team not found'), { statusCode: 404 });
  }

  const rowSub = row.stripe_subscription_id != null ? String(row.stripe_subscription_id).trim() : '';
  if (!rowSub || rowSub !== subscriptionId) {
    throw Object.assign(new Error('Subscription does not belong to this team'), { statusCode: 403 });
  }

  await adminOps.adminCancelSubscription({ subscriptionId, immediate: true });
  return { success: true, canceled: subscriptionId };
}

export { internalTeamSubscriptionCancel };