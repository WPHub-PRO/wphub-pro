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

export default async function handleListTeamInvoices(
  ctx: UserBillingCtx,
  billingCustomerId: () => Promise<string>,
) {
  const { userId, body, req, stripe, databases } = ctx;
  const customerId = String(body.stripeCustomerId ?? body.stripe_customer_id ?? '').trim();
      if (!customerId.startsWith('cus_')) {
        throw Object.assign(new Error('stripeCustomerId is required'), { statusCode: 400 });
      }
      const databases = appwriteDatabases();
      const dbId =
        process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
      const teamsColl = platformTeamsTableId();
      const rows = await databases.listDocuments(dbId, teamsColl, [
        Query.equal('stripe_customer_id', customerId),
        Query.limit(2),
      ]);
      const row = rows.documents?.[0];
      if (!row) {
        throw Object.assign(new Error('Team billing record not found for this customer'), { statusCode: 404 });
      }
      const ownerId = String(row.owner_id || '').trim();
      if (ownerId !== String(userId).trim()) {
        throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
      }
      const list = await listInvoicesForCustomer(customerId, { limit: 50 });
      return { invoices: list.data.map(mapInvoice) };
}
