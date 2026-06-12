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

export default async function handlePreparePayInvoice(
  ctx: UserBillingCtx,
  billingCustomerId: () => Promise<string>,
) {
  const { userId, body, req, stripe, databases } = ctx;
  const customerId = await billingCustomerId();
      const invoiceId = String(body.invoiceId ?? '').trim();
      if (!invoiceId) throw Object.assign(new Error('invoiceId is required'), { statusCode: 400 });
      const inv = await stripe.invoices.retrieve(invoiceId, { expand: ['payment_intent'] });
      const invCust = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
      if (invCust !== customerId) {
        throw Object.assign(new Error('Invoice does not belong to this customer'), { statusCode: 403 });
      }
      if (inv.status === 'paid') {
        return { success: true, paid: true };
      }
      let current = inv;
      if (current.status === 'draft') {
        current = await stripe.invoices.finalizeInvoice(current.id, { expand: ['payment_intent'] });
      }
      const pi = current.payment_intent;
      const piObj = typeof pi === 'object' && pi && 'client_secret' in pi ? pi : null;
      return {
        success: true,
        paid: false,
        clientSecret: piObj?.client_secret,
        invoiceId: current.id,
        amountDue: current.amount_due,
        currency: current.currency,
        paymentIntentStatus: piObj?.status,
      };
}
