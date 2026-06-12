import type { UserBillingCtx } from '../../../lib/types.ts';
import {
  appwriteDatabases,
  appwriteTeams,
  appwriteUsers,
  assertSubscriptionBelongsToCustomer,
  assertTeamCheckoutBillingDetails,
  buildSubscriptionDetailsResponse,
  createStripeCustomerAndSavePrefs,
  getStripeCustomerId,
  inferStripeTaxIdTypeFromVatValue,
  invoiceLineTotalCents,
  listCustomerTaxIdsMapped,
  listInvoicesForCustomer,
  listSubscriptionsForCustomer,
  mapInvoice,
  parseTeamCheckoutBillingDetails,
  pmCard,
  resolveTeamCheckoutBasePriceId,
  retrieveStripeSubscription,
  subscriptionCustomerIdFromSub,
  syncAccountsStripeCustomerId,
  syncStripeTeamCustomerEmail,
  teamPlanCheckoutReturnUrl,
  upcomingInvoiceProrationLinesOnly,
} from '../lib/helpers.ts';
import { listPlansForAdmin } from '../../../lib/services/plansExt.ts';
import { fetchPlatformAccountDoc } from '../../../lib/platformAccount.ts';
import { readTeamBillingJson } from '../../../lib/platformTeamBilling.ts';
import finalizeTeamCheckout from '../../../lib/finalizeTeamCheckout.ts';
import { resolveStripeBillingCustomer } from '../../../lib/billingEntity.ts';
import { platformTeamsTableId, WPHUB_APPWRITE_IDS, Query } from '@code045/wphubpro-shared';
import { getStripe } from '../../../lib/stripeClient.ts';

export default async function handleEnsureCustomer(
  ctx: UserBillingCtx,
  billingCustomerId: () => Promise<string>,
) {
  const { userId, body, req, stripe, databases } = ctx;
  const users = appwriteUsers();
      const u = await users.get(userId);
      const existing = await getStripeCustomerId(userId);
      if (existing) {
        await syncAccountsStripeCustomerId(userId, existing);
        return { success: true, skipped: true, stripeCustomerId: existing, message: 'Customer already exists.' };
      }
      const { stripeCustomerId } = await createStripeCustomerAndSavePrefs({
        userId,
        email: u.email,
        name: u.name,
      });
      return { success: true, stripeCustomerId, message: 'Stripe customer created.' };
}
