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

export default async function handleTransferTeamOwnership(
  ctx: UserBillingCtx,
  billingCustomerId: () => Promise<string>,
) {
  const { userId, body, req, stripe, databases } = ctx;
  const teamId = String(body.teamId ?? body.team_id ?? '').trim();
      const newOwner = String(body.newOwnerUserId ?? body.new_owner_user_id ?? '').trim();
      if (!teamId || !newOwner) {
        throw Object.assign(new Error('teamId and newOwnerUserId are required'), { statusCode: 400 });
      }
      const tColl = platformTeamsTableId();
      const db =
        process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId;
      let row;
      try {
        row = await databases.getDocument(db, tColl, teamId);
      } catch {
        throw Object.assign(new Error('Team not found'), { statusCode: 404 });
      }
      if (String(row.owner_id || '').trim() !== String(userId).trim()) {
        throw Object.assign(new Error('Forbidden: only the current owner can transfer ownership'), {
          statusCode: 403,
        });
      }
      if (newOwner === String(userId).trim()) {
        return { success: true, skipped: true, message: 'Already owner.' };
      }
      await databases.updateDocument(db, tColl, teamId, { owner_id: newOwner });
      const stripeSync = await syncStripeTeamCustomerEmail(stripe, databases, teamId);
      return { success: true, teamId, newOwnerUserId: newOwner, stripe: stripeSync };
}
