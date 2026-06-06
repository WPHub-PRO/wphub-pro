import Stripe from 'stripe';

function getStripe() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret || !String(secret).trim()) {
    throw new Error('STRIPE_SECRET_KEY is not configured on this function');
  }
  return new Stripe(String(secret).trim(), { typescript: false });
}

export { getStripe };