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

export default async function handleCancelScheduledChange(
  ctx: UserBillingCtx,
  billingCustomerId: () => Promise<string>,
) {
  const { userId, body, req, stripe, databases } = ctx;
  const customerId = await billingCustomerId();
      let scheduleId = typeof body.scheduleId === 'string' ? body.scheduleId.trim() : '';
      const subscriptionId = typeof body.subscriptionId === 'string' ? body.subscriptionId.trim() : '';
      if (!scheduleId && subscriptionId) {
        await assertSubscriptionBelongsToCustomer(stripe, subscriptionId, customerId);
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        if (typeof sub.schedule === 'string') scheduleId = sub.schedule;
      }
      if (!scheduleId) {
        throw Object.assign(new Error('scheduleId or subscriptionId with an active schedule is required'), {
          statusCode: 400,
        });
      }
      const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId, { expand: ['customer'] });
      const schCust =
        typeof schedule.customer === 'string'
          ? schedule.customer
          : schedule.customer && typeof schedule.customer === 'object' && 'id' in schedule.customer
            ? schedule.customer.id
            : null;
      if (schCust && schCust !== customerId) {
        throw Object.assign(new Error('Schedule does not belong to this billing context'), { statusCode: 403 });
      }
      const subRef = schedule.subscription;
      const sid = typeof subRef === 'string' ? subRef : subRef && 'id' in subRef ? subRef.id : null;
      if (sid) {
        await assertSubscriptionBelongsToCustomer(stripe, sid, customerId);
      }
      await stripe.subscriptionSchedules.cancel(scheduleId);
      return { success: true, scheduleId };
}
