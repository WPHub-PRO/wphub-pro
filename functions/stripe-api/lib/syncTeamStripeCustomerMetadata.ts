/**
 * Team billing Stripe customers use `appwrite_owner_id` and `appwrite_team_id` (not `appwrite_user_id`).
 * Merges with existing customer metadata and clears legacy `appwrite_user_id` when present.
 *
 * @param {object} opts
 * @param {import('stripe').Stripe} opts.stripe
 * @param {string} opts.customerId `cus_…`
 * @param {string} opts.ownerUserId Appwrite user id
 * @param {string} opts.teamId Appwrite team id
 */
async function syncTeamStripeCustomerMetadata(opts) {
  const { stripe, customerId, ownerUserId, teamId } = opts;
  const cid = String(customerId || '').trim();
  if (!cid.startsWith('cus_')) return;
  const uid = String(ownerUserId || '').trim();
  const tid = String(teamId || '').trim();
  if (!uid || !tid) return;

  const cust = await stripe.customers.retrieve(cid);
  if (!cust || typeof cust !== 'object' || ('deleted' in cust && cust.deleted)) return;

  const prev = cust.metadata && typeof cust.metadata === 'object' ? { ...cust.metadata } : {};
  const meta = { ...prev };
  meta.appwrite_owner_id = uid;
  meta.appwrite_team_id = tid;
  if (Object.prototype.hasOwnProperty.call(meta, 'appwrite_user_id')) {
    meta.appwrite_user_id = '';
  }
  await stripe.customers.update(cid, { metadata: meta });
}

export default syncTeamStripeCustomerMetadata;