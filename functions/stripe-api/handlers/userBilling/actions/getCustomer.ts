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

export default async function handleGetCustomer(
  ctx: UserBillingCtx,
  billingCustomerId: () => Promise<string>,
) {
  const { userId, body, req, stripe, databases } = ctx;
  const customerId = await billingCustomerId();
      const c = await stripe.customers.retrieve(customerId, {
        expand: ['invoice_settings.default_payment_method'],
      });
      if (c.deleted) throw Object.assign(new Error('Customer deleted'), { statusCode: 400 });
      const addr = c.address;
      let taxIds = [];
      try {
        taxIds = await listCustomerTaxIdsMapped(stripe, customerId);
      } catch (e) {
        console.warn('[get-customer] tax_ids', e && e.message ? e.message : e);
      }
      return {
        success: true,
        customer: {
          id: c.id,
          email: c.email,
          name: c.name,
          phone: c.phone,
          address: addr
            ? {
                line1: addr.line1,
                line2: addr.line2,
                city: addr.city,
                state: addr.state,
                postal_code: addr.postal_code,
                country: addr.country,
              }
            : null,
          tax_ids: taxIds,
        },
      };
}
