import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { postStripeJson } from '@/lib/stripe-loader';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

/**
 * After login/session restore: ensure `platform_db.accounts` row exists for the Appwrite user, then ensure
 * Stripe customer (`stripe-api` `POST /user-billing` `ensure-customer`) and sync `stripe_customer_id` on the accounts doc.
 *
 * Pass `appwriteUserId` when known (from `account.get()`) so the server creates the row for the correct user.
 */
export async function ensurePlatformAccount(appwriteUserId?: string | null): Promise<void> {
  const uid = typeof appwriteUserId === 'string' ? appwriteUserId.trim() : '';
  try {
    await executeFunction<{ success?: boolean }>(
      APPWRITE_FUNCTION_IDS.USERS,
      uid ? { action: 'ensure-account', userId: uid } : { action: 'ensure-account' },
    );
    await postStripeJson<{ success?: boolean; skipped?: boolean }>('/user-billing', {
      action: 'ensure-customer',
    });
  } catch (e) {
    console.warn('[ensurePlatformAccount]', e);
  }
}
