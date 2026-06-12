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

export default async function handleUpdateCustomer(
  ctx: UserBillingCtx,
  billingCustomerId: () => Promise<string>,
) {
  const { userId, body, req, stripe, databases } = ctx;
  const customerId = await billingCustomerId();
      const name = typeof body.name === 'string' ? body.name : undefined;
      const email = typeof body.email === 'string' ? body.email : undefined;
      const phone = typeof body.phone === 'string' ? body.phone : undefined;
      const address = body.address;
      await stripe.customers.update(customerId, {
        name: name ?? undefined,
        email: email ?? undefined,
        phone: phone ?? undefined,
        address:
          address && typeof address === 'object'
            ? {
                line1: address.line1 ?? undefined,
                line2: address.line2 ?? undefined,
                city: address.city ?? undefined,
                state: address.state ?? undefined,
                postal_code: address.postal_code ?? undefined,
                country: address.country ?? undefined,
              }
            : undefined,
      });
      return { success: true };
}
