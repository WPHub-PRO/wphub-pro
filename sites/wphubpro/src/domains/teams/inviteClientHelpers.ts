import { ensurePlatformAccount } from '@/domains/auth/ensurePlatformAccount';
import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { postStripeJson } from '@/lib/stripe-loader';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

const USERS_FN = APPWRITE_FUNCTION_IDS.USERS;

/** Optional $0 recurring price id — same session as Stripe function. */
export async function attachFreeTierIfConfigured(appwriteUserId?: string | null): Promise<void> {
  const freePrice = String(
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_STRIPE_FREE_PRICE_ID || '',
  ).trim();
  if (!freePrice) return;
  /** ensure-account only creates the Appwrite row; Stripe customer + stripe_customer_id come from stripe-api. */
  await ensurePlatformAccount(appwriteUserId ?? undefined);
  const ens = await executeFunction<{ account?: { stripe_customer_id?: string } }>(USERS_FN, {
    action: 'ensure-account',
  });
  const cid = String(ens?.account?.stripe_customer_id || '').trim();
  if (!cid.startsWith('cus_')) return;
  try {
    await postStripeJson('/subscriptions', {
      action: 'create',
      customerId: cid,
      priceId: freePrice,
    });
  } catch {
    /* optional */
  }
}
