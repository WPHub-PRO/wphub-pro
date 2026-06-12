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

export default async function handlePreviewProration(
  ctx: UserBillingCtx,
  billingCustomerId: () => Promise<string>,
) {
  const { userId, body, req, stripe, databases } = ctx;
  const customerId = await billingCustomerId();
      const subscriptionId = String(body.subscriptionId ?? '').trim();
      const newPriceId = String(body.newPriceId ?? '').trim();
      if (!subscriptionId || !newPriceId) {
        throw Object.assign(new Error('subscriptionId and newPriceId are required'), { statusCode: 400 });
      }
      await assertSubscriptionBelongsToCustomer(stripe, subscriptionId, customerId);
      const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['items.data.price'] });
      const item = sub.items.data[0];
      if (!item?.id) throw Object.assign(new Error('Subscription has no line items'), { statusCode: 400 });
      const inv = await stripe.invoices.retrieveUpcoming({
        customer: customerId,
        subscription: subscriptionId,
        subscription_items: [{ id: item.id, price: newPriceId }],
      });
      const periodEnd = sub.current_period_end;
      const useLines = upcomingInvoiceProrationLinesOnly(inv, periodEnd);
      const lines = useLines.map((line) => ({
          description: line.description ?? '',
          amount: invoiceLineTotalCents(line),
          period: {
            start: line.period?.start ?? inv.period_start,
            end: line.period?.end ?? inv.period_end,
          },
        }));
      const amountDue = useLines.reduce((sum, line) => sum + invoiceLineTotalCents(line), 0);
      return {
        amountDue,
        currency: inv.currency,
        nextPaymentDate: null,
        lines,
      };
}
