/**
 * Team catalog products: `wphub_track=team` or legacy `type` metadata containing "team".
 *
 * @param {import('stripe').Stripe.Product | null | undefined} prod
 * @returns {boolean}
 */
export default function isTeamStripeProduct(prod) {
  if (!prod || typeof prod !== 'object' || ('deleted' in prod && prod.deleted)) return false;
  const meta = prod.metadata || {};
  const track = String(meta.wphub_track || '').trim().toLowerCase();
  const typeMeta = String(meta.type || '').trim().toLowerCase();
  return track === 'team' || typeMeta.includes('team');
};
