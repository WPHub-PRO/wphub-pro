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

export default async function handleCreateCheckoutSession(
  ctx: UserBillingCtx,
  billingCustomerId: () => Promise<string>,
) {
  const { userId, body, req, stripe, databases } = ctx;
  const customerId = await billingCustomerId();
      const priceId = String(body.priceId ?? '').trim();
      const returnUrl = String(body.returnUrl ?? '').trim() || 'http://localhost:5173';
      const updateType = body.updateType;
      const paymentMethodId = typeof body.paymentMethodId === 'string' ? body.paymentMethodId.trim() : '';

      if (!priceId) throw Object.assign(new Error('priceId is required'), { statusCode: 400 });

      const subs = await listSubscriptionsForCustomer(customerId);
      const active = subs.data.find((s) => s.status === 'active' || s.status === 'trialing');

      if (!active) {
        const success = new URL(returnUrl);
        success.searchParams.set('success', 'true');
        const canceled = new URL(returnUrl);
        canceled.searchParams.set('canceled', 'true');
        const extraLineItems = Array.isArray(body.extraLineItems) ? body.extraLineItems : [];
        const extras = extraLineItems
          .filter((x) => x && typeof x.priceId === 'string' && x.priceId.trim())
          .map((x) => ({
            price: String(x.priceId).trim(),
            quantity: Math.max(1, Math.min(999, Number(x.quantity) || 1)),
          }));
        const line_items = [{ price: priceId, quantity: 1 }, ...extras];
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          customer: customerId,
          line_items,
          success_url: success.toString(),
          cancel_url: canceled.toString(),
          allow_promotion_codes: true,
        });
        return {
          sessionId: session.id,
          url: session.url,
          subscriptionId: session.subscription,
          status: session.status,
        };
      }

      const itemId = active.items.data[0]?.id;
      if (!itemId) throw Object.assign(new Error('Subscription has no items'), { statusCode: 400 });

      const updated = await stripe.subscriptions.update(active.id, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: updateType === 'downgrade' ? 'none' : 'create_prorations',
        default_payment_method: paymentMethodId || undefined,
        expand: ['latest_invoice.payment_intent', 'latest_invoice'],
      });

      const inv = updated.latest_invoice;
      const invObj = typeof inv === 'object' && inv && !('deleted' in inv) ? inv : null;
      const pi = invObj?.payment_intent;
      const piObj = typeof pi === 'object' && pi && 'client_secret' in pi ? pi : null;

      if (piObj?.client_secret && invObj && invObj.amount_due > 0) {
        return {
          subscriptionId: updated.id,
          status: updated.status,
          payment: {
            clientSecret: piObj.client_secret,
            invoiceId: invObj.id,
            amountDue: invObj.amount_due,
            currency: invObj.currency,
            status: piObj.status ?? '',
          },
        };
      }

      return {
        subscriptionId: updated.id,
        status: updated.status,
        message: 'Plan updated.',
      };
}
