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

export default async function handleGetSubscription(
  ctx: UserBillingCtx,
  billingCustomerId: () => Promise<string>,
) {
  const { userId, body, req, stripe, databases } = ctx;
  const billingCtx = await resolveStripeBillingCustomer({
        databases,
        req,
        userId,
        body: body && typeof body === 'object' ? body : {},
        users: appwriteUsers(),
      });
      const customerId = billingCtx.customerId;
      const subs = await listSubscriptionsForCustomer(customerId);
      let active =
        subs.data.find((s) => s.status === 'active' || s.status === 'trialing') ||
        subs.data.find((s) => s.status === 'past_due' || s.status === 'unpaid') ||
        null;

      if (!active && billingCtx.entityType === 'team' && billingCtx.teamId) {
        try {
          const tColl = platformTeamsTableId();
          const db =
            String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
          const row = await databases.getDocument(db, tColl, billingCtx.teamId);
          const pinned = String(row.stripe_subscription_id ?? '').trim();
          if (pinned.startsWith('sub_')) {
            const sub = await retrieveStripeSubscription(pinned);
            const custId = subscriptionCustomerIdFromSub(sub);
            const okStatus =
              sub &&
              ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status) &&
              custId === customerId;
            if (okStatus) active = sub;
          }
        } catch {
          /* ignore */
        }
      }

      if (!active) return { status: 'canceled' };
      const item = active.items.data[0];
      const price = item?.price;
      const product =
        price?.product && typeof price.product === 'object' && !('deleted' in price.product) ? price.product : null;
      const meta = product?.metadata ?? {};
      const sitesLimit = Number(meta.sites_limit ?? meta.sitesLimit ?? 0) || 0;
      const libraryLimit = Number(meta.library_limit ?? meta.libraryLimit ?? 0) || 0;
      const storageLimit = Number(meta.storage_limit ?? meta.storageLimit ?? 0) || 0;
      const interval = price?.recurring?.interval === 'year' ? 'year' : 'month';
      return {
        userId,
        stripeSubscriptionId: active.id,
        stripe_subscription_id: active.id,
        planId: product?.id ?? (typeof price?.product === 'string' ? price.product : ''),
        status:
          active.status === 'active'
            ? 'active'
            : active.status === 'trialing'
              ? 'trialing'
              : 'past_due',
        sitesLimit,
        storageLimit,
        libraryLimit,
        source: 'stripe',
        currentPeriodEnd: active.current_period_end,
        cancelAtPeriodEnd: active.cancel_at_period_end,
        priceId: price?.id,
        priceAmount: price?.unit_amount ?? undefined,
        currency: price?.currency,
        interval,
        intervalCount: price?.recurring?.interval_count,
      };
}
