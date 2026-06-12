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

export default async function handleCreateTeamCheckoutSession(
  ctx: UserBillingCtx,
  billingCustomerId: () => Promise<string>,
) {
  const { userId, body, req, stripe, databases } = ctx;
  const teamName = String(body.teamName ?? body.team_name ?? '').trim();
      if (!teamName || teamName.length > 128) {
        throw Object.assign(new Error('teamName is required (max 128 chars)'), { statusCode: 400 });
      }
      const billingDetails = parseTeamCheckoutBillingDetails(body);
      assertTeamCheckoutBillingDetails(billingDetails);
      const returnUrl = String(body.returnUrl ?? '').trim() || 'http://localhost:5173';
      const interval = String(body.interval ?? 'month').toLowerCase() === 'year' ? 'year' : 'month';
      const billing = await readTeamBillingJson(req);
      const stripe = getStripe();
      let priceId = await resolveTeamCheckoutBasePriceId(stripe, body.priceId ?? body.price_id, interval);
      if (!priceId) {
        priceId =
          interval === 'year'
            ? String(billing?.teamYearlyPriceId ?? '').trim()
            : String(billing?.teamMonthlyPriceId ?? '').trim();
      }
      if (!priceId) {
        throw Object.assign(new Error('Team plan price is not configured (pick a plan or set admin Finance → Plans).'), {
          statusCode: 503,
        });
      }

      const priceDoc = await stripe.prices.retrieve(priceId, { expand: ['product'] });
      const pref = priceDoc.product;
      const prod =
        typeof pref === 'string'
          ? await stripe.products.retrieve(pref)
          : pref && typeof pref === 'object' && !('deleted' in pref && pref.deleted)
            ? pref
            : null;
      if (!prod || prod.deleted) {
        throw Object.assign(new Error('Could not load Stripe product for this team price.'), { statusCode: 400 });
      }
      const rawSeats = prod.metadata && String(prod.metadata.seats_included ?? '').trim();
      const parsed = Number(rawSeats);
      if (!rawSeats || !Number.isFinite(parsed) || parsed < 1) {
        throw Object.assign(
          new Error('Team product must define Stripe metadata seats_included (positive integer).'),
          { statusCode: 400 },
        );
      }
      const initialSeats = Math.max(1, Math.min(999, Math.floor(parsed)));

      const users = appwriteUsers();
      const u = await users.get(userId);
      const taxType =
        billingDetails.vatNumber && billingDetails.vatNumber.length >= 3
          ? inferStripeTaxIdTypeFromVatValue(billingDetails.vatNumber)
          : null;
      /** @type {import('stripe').Stripe.CustomerCreateParams} */
      const customerCreate = {
        name: billingDetails.billingCompanyName,
        email: u.email || undefined,
        address: {
          line1: billingDetails.line1,
          line2: billingDetails.line2,
          city: billingDetails.city,
          state: billingDetails.state,
          postal_code: billingDetails.postalCode,
          country: billingDetails.country,
        },
        metadata: {
          wphub_team: '1',
          appwrite_owner_id: userId,
          team_workspace_name: teamName.slice(0, 500),
        },
      };
      if (billingDetails.vatNumber && taxType) {
        customerCreate.tax_id_data = [{ type: taxType, value: billingDetails.vatNumber }];
      }
      let customer;
      try {
        customer = await stripe.customers.create(customerCreate);
      } catch (e) {
        const msg = e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Stripe customer creation failed';
        throw Object.assign(new Error(msg), { statusCode: 400 });
      }
      const successUrl = teamPlanCheckoutReturnUrl(returnUrl, 'success');
      const cancelUrl = teamPlanCheckoutReturnUrl(returnUrl, 'canceled');
      const lineItems = [{ price: priceId, quantity: 1 }];
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: customer.id,
        line_items: lineItems,
        success_url: successUrl,
        cancel_url: cancelUrl,
        allow_promotion_codes: true,
        metadata: {
          wphub_checkout: 'team_plan',
          appwrite_owner_id: userId,
          team_name: teamName,
          initial_seats: String(initialSeats),
        },
        subscription_data: {
          metadata: {
            wphub_checkout: 'team_plan',
            appwrite_owner_id: userId,
            team_name: teamName,
            initial_seats: String(initialSeats),
          },
        },
      });
      return { sessionId: session.id, url: session.url };
}
