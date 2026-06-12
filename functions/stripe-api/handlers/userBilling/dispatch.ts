import { fail, ok } from '@code045/wphubpro-shared';
import type { StripeApiCtx, UserBillingActionKey, UserBillingCtx, UserBillingHandler } from '../../lib/types.ts';
import { getStripe } from '../../lib/stripeClient.ts';
import { resolveStripeBillingCustomer } from '../../lib/billingEntity.ts';
import { errorMessage, statusFromError } from '../../lib/handlerUtils.ts';
import { setStripeAppwriteReq, appwriteUsers, appwriteDatabases } from './lib/helpers.ts';
import { assertTeamMemberBillingAccess } from './lib/teamMemberGate.ts';

import handleListInvoices from './actions/listInvoices.ts';
import handleListPlans from './actions/listPlans.ts';
import handleCreateCheckoutSession from './actions/createCheckoutSession.ts';
import handleCancelSubscription from './actions/cancelSubscription.ts';
import handleGetSubscription from './actions/getSubscription.ts';
import handleGetCustomer from './actions/getCustomer.ts';
import handleListPaymentMethods from './actions/listPaymentMethods.ts';
import handleCreateSetupIntent from './actions/createSetupIntent.ts';
import handleAttachPaymentMethod from './actions/attachPaymentMethod.ts';
import handleDetachPaymentMethod from './actions/detachPaymentMethod.ts';
import handleSetDefaultPaymentMethod from './actions/setDefaultPaymentMethod.ts';
import handleGetSubscriptionDetails from './actions/getSubscriptionDetails.ts';
import handlePreviewProration from './actions/previewProration.ts';
import handlePreparePayInvoice from './actions/preparePayInvoice.ts';
import handleUpdateCustomer from './actions/updateCustomer.ts';
import handleAddCustomerTaxId from './actions/addCustomerTaxId.ts';
import handleDeleteCustomerTaxId from './actions/deleteCustomerTaxId.ts';
import handleListCustomerTaxIds from './actions/listCustomerTaxIds.ts';
import handleEnsureCustomer from './actions/ensureCustomer.ts';
import handleCancelScheduledChange from './actions/cancelScheduledChange.ts';
import handleBillingPortal from './actions/billingPortal.ts';
import handleCreateTeamCheckoutSession from './actions/createTeamCheckoutSession.ts';
import handleFinalizeTeamCheckout from './actions/finalizeTeamCheckout.ts';
import handleListTeamInvoices from './actions/listTeamInvoices.ts';
import handleSyncTeamStripeCustomerEmail from './actions/syncTeamStripeCustomerEmail.ts';
import handleTransferTeamOwnership from './actions/transferTeamOwnership.ts';

const ACTION_HANDLERS: Record<UserBillingActionKey, UserBillingHandler> = {
  'list-invoices': handleListInvoices,
  'list-plans': handleListPlans,
  'create-checkout-session': handleCreateCheckoutSession,
  'cancel-subscription': handleCancelSubscription,
  'get-subscription': handleGetSubscription,
  'get-customer': handleGetCustomer,
  'list-payment-methods': handleListPaymentMethods,
  'create-setup-intent': handleCreateSetupIntent,
  'attach-payment-method': handleAttachPaymentMethod,
  'detach-payment-method': handleDetachPaymentMethod,
  'set-default-payment-method': handleSetDefaultPaymentMethod,
  'get-subscription-details': handleGetSubscriptionDetails,
  'preview-proration': handlePreviewProration,
  'prepare-pay-invoice': handlePreparePayInvoice,
  'update-customer': handleUpdateCustomer,
  'add-customer-tax-id': handleAddCustomerTaxId,
  'delete-customer-tax-id': handleDeleteCustomerTaxId,
  'list-customer-tax-ids': handleListCustomerTaxIds,
  'ensure-customer': handleEnsureCustomer,
  'cancel-scheduled-change': handleCancelScheduledChange,
  'billing-portal': handleBillingPortal,
  'create-team-checkout-session': handleCreateTeamCheckoutSession,
  'finalize-team-checkout': handleFinalizeTeamCheckout,
  'list-team-invoices': handleListTeamInvoices,
  'sync-team-stripe-customer-email': handleSyncTeamStripeCustomerEmail,
  'transfer-team-ownership': handleTransferTeamOwnership,
};

const ACTION_ALIASES: Record<string, UserBillingActionKey> = {
  'add-tax-id': 'add-customer-tax-id',
  'delete-tax-id': 'delete-customer-tax-id',
  'list-tax-ids': 'list-customer-tax-ids',
  'cancel-schedule-update': 'cancel-scheduled-change',
};

function normalizeAction(raw: unknown): UserBillingActionKey | '' {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s in ACTION_ALIASES) return ACTION_ALIASES[s];
  if (s in ACTION_HANDLERS) return s as UserBillingActionKey;
  return '';
}

export default async function handleUserBillingDispatch(ctx: StripeApiCtx) {
  const action = normalizeAction(ctx.body.action);
  if (!action) {
    return fail(ctx.res, `Unknown billing action: ${String(ctx.body.action ?? '(missing)')}`, 400);
  }

  if (!ctx.executorUserId || !ctx.databases) {
    return fail(ctx.res, 'Unauthorized', 401);
  }

  setStripeAppwriteReq(ctx.req);
  try {
    const gate = await assertTeamMemberBillingAccess(ctx.databases, ctx.executorUserId, ctx.body, action);
    if (gate.blocked) {
      if (gate.skipped) {
        return ok(ctx.res, { success: true, skipped: true, reason: gate.reason ?? 'team_member' });
      }
      return fail(ctx.res, 'Billing is managed by your team owner.', 403);
    }

    const stripe = getStripe();
    const databases = ctx.databases;
    const userId = ctx.executorUserId;

    const billingCustomerId = async () => {
      const { customerId } = await resolveStripeBillingCustomer({
        databases,
        req: ctx.req,
        userId,
        body: ctx.body,
        users: appwriteUsers(),
      });
      return customerId;
    };

    const ubCtx: UserBillingCtx = {
      ...ctx,
      userId,
      stripe,
      databases,
    };

    const fn = ACTION_HANDLERS[action];
    const data = await fn(ubCtx, billingCustomerId);
    return ok(ctx.res, data);
  } catch (e) {
    const sc = statusFromError(e) ?? 500;
    return fail(ctx.res, errorMessage(e), sc);
  } finally {
    setStripeAppwriteReq(undefined);
  }
}
