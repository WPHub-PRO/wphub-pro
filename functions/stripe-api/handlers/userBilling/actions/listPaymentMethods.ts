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

export default async function handleListPaymentMethods(
  ctx: UserBillingCtx,
  billingCustomerId: () => Promise<string>,
) {
  const { userId, body, req, stripe, databases } = ctx;
  const customerId = await billingCustomerId();
      const customer = await stripe.customers.retrieve(customerId, {
        expand: ['invoice_settings.default_payment_method'],
      });
      if (customer.deleted) throw Object.assign(new Error('Customer deleted'), { statusCode: 400 });
      const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
      let defaultPaymentMethodId = null;
      const dpm = customer.invoice_settings?.default_payment_method;
      if (typeof dpm === 'string') defaultPaymentMethodId = dpm;
      else if (dpm && typeof dpm === 'object' && 'id' in dpm) defaultPaymentMethodId = dpm.id;

      const paymentMethods = list.data.map((pm) => ({
        id: pm.id,
        type: pm.type,
        card: pmCard(pm),
      }));
      return { paymentMethods, defaultPaymentMethodId };
}
