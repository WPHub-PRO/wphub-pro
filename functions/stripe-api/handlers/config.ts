/**
 * GET /config — publishable key (safe for browsers).
 */
function getPublishableConfig() {
  const stripe_publishable_key =
    (process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
  if (!stripe_publishable_key) {
    throw new Error('STRIPE_PUBLISHABLE_KEY is not configured on this function');
  }
  return { success: true, stripe_publishable_key };
}

export { getPublishableConfig };