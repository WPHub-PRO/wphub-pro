/**
 * stripe-api — declarative route registry (replaces handlers/router.ts).
 */
import type { HttpMethod, RouteDef } from './types.ts';

import handleGetConfig from '../handlers/config/getConfig.ts';
import handleListPlans from '../handlers/public/listPlans.ts';
import handleListSubscriptions from '../handlers/account/listSubscriptions.ts';
import handleListAccountInvoices from '../handlers/account/listInvoices.ts';
import handlePostSubscription from '../handlers/account/postSubscription.ts';
import handleWebhook from '../handlers/webhook/handleWebhook.ts';
import handleTeamSubscriptionCancel from '../handlers/internal/teamSubscriptionCancel.ts';
import handleGetDashboardStats from '../handlers/admin/stats/getDashboardStats.ts';
import handleAdminListSubscriptions from '../handlers/admin/subscriptions/listSubscriptions.ts';
import handleGetSubscription from '../handlers/admin/subscriptions/getSubscription.ts';
import handleSubscriptionAction from '../handlers/admin/subscriptions/subscriptionAction.ts';
import handleCancelSubscription from '../handlers/admin/subscriptions/cancel.ts';
import handlePauseSubscription from '../handlers/admin/subscriptions/pause.ts';
import handleResumeSubscription from '../handlers/admin/subscriptions/resume.ts';
import handleChangePrice from '../handlers/admin/subscriptions/changePrice.ts';
import handleListProducts from '../handlers/admin/plans/listProducts.ts';
import handleListCatalog from '../handlers/admin/plans/listCatalog.ts';
import handleGetCatalogDetail from '../handlers/admin/plans/getCatalogDetail.ts';
import handleCreateProduct from '../handlers/admin/plans/createProduct.ts';
import handleUpdateProduct from '../handlers/admin/plans/updateProduct.ts';
import handleCreatePrice from '../handlers/admin/plans/createPrice.ts';
import handleBillingOverview from '../handlers/admin/billing/overview.ts';
import handleCustomerSubscriptions from '../handlers/admin/billing/customerSubscriptions.ts';
import handleBatchPlanLabels from '../handlers/admin/billing/batchPlanLabels.ts';
import handleGetInvoice from '../handlers/admin/billing/getInvoice.ts';
import handleSendInvoiceReminder from '../handlers/admin/billing/sendInvoiceReminder.ts';
import handleRecentInvoices from '../handlers/admin/billing/recentInvoices.ts';
import handleFinanceDashboard from '../handlers/admin/finance/dashboard.ts';
import handleListSubscriptionRows from '../handlers/admin/subscriptionRows/list.ts';
import handleListPaymentIntents from '../handlers/admin/paymentIntents/list.ts';
import handleGetPaymentIntentDetail from '../handlers/admin/paymentIntents/getDetail.ts';
import handleCatalogMetadata from '../handlers/admin/plans/catalogMetadata.ts';
import handleSetProductActive from '../handlers/admin/plans/setProductActive.ts';
import handleSetPriceActive from '../handlers/admin/plans/setPriceActive.ts';
import handleCreatePriceMajor from '../handlers/admin/plans/createPriceMajor.ts';
import handleTeamBillingGet from '../handlers/admin/plans/teamBillingGet.ts';
import handleTeamBillingSave from '../handlers/admin/plans/teamBillingSave.ts';
import handlePersonalBillingGet from '../handlers/admin/plans/personalBillingGet.ts';
import handlePersonalBillingSave from '../handlers/admin/plans/personalBillingSave.ts';
import handleReconcileFreeTier from '../handlers/admin/tools/reconcileFreeTier.ts';
import handleBackfillTeamSubscriptionsGet from '../handlers/admin/tools/backfillTeamSubscriptionsGet.ts';
import handleBackfillTeamSubscriptionsPost from '../handlers/admin/tools/backfillTeamSubscriptionsPost.ts';
import handleUserBillingDispatch from '../handlers/userBilling/dispatch.ts';

export type MatchedRoute = {
  def: RouteDef;
  params: Record<string, string>;
};

const ROUTES: RouteDef[] = [
  { method: 'GET', path: '/config', handler: handleGetConfig, needsPublishableKey: true },
  {
    method: 'POST',
    path: '/internal/team-subscription/cancel',
    handler: handleTeamSubscriptionCancel,
    needsAppwrite: true,
  },
  { method: 'GET', path: '/admin/stats', handler: handleGetDashboardStats, needsStripeSecret: true },
  { method: 'GET', path: '/plans', handler: handleListPlans, needsStripeSecret: true },
  {
    method: 'GET',
    path: '/subscriptions',
    handler: handleListSubscriptions,
    needsAuth: true,
    needsStripeSecret: true,
  },
  {
    method: 'GET',
    path: '/billing',
    handler: handleListAccountInvoices,
    needsAuth: true,
    needsStripeSecret: true,
  },
  {
    method: 'POST',
    path: '/subscriptions',
    handler: handlePostSubscription,
    needsAuth: true,
    needsStripeSecret: true,
  },
  {
    method: 'GET',
    path: '/admin/subscriptions',
    handler: handleAdminListSubscriptions,
    needsStripeSecret: true,
  },
  {
    method: 'GET',
    path: /^\/admin\/subscriptions\/([^/]+)$/,
    handler: handleGetSubscription,
    needsStripeSecret: true,
  },
  {
    method: 'POST',
    path: /^\/admin\/subscriptions\/([^/]+)\/actions$/,
    handler: handleSubscriptionAction,
    needsStripeSecret: true,
  },
  { method: 'GET', path: '/admin/plans', handler: handleListProducts, needsStripeSecret: true },
  { method: 'GET', path: '/admin/plans/catalog', handler: handleListCatalog, needsStripeSecret: true },
  {
    method: 'GET',
    path: /^\/admin\/plans\/catalog\/([^/]+)$/,
    handler: handleGetCatalogDetail,
    needsStripeSecret: true,
  },
  { method: 'POST', path: '/admin/plans/products', handler: handleCreateProduct, needsStripeSecret: true },
  {
    method: 'PATCH',
    path: /^\/admin\/plans\/products\/([^/]+)$/,
    handler: handleUpdateProduct,
    needsStripeSecret: true,
  },
  { method: 'POST', path: '/admin/plans/prices', handler: handleCreatePrice, needsStripeSecret: true },
  { method: 'GET', path: '/admin/billing', handler: handleBillingOverview, needsStripeSecret: true },
  {
    method: 'GET',
    path: /^\/admin\/billing\/customers\/([^/]+)\/subscriptions$/,
    handler: handleCustomerSubscriptions,
    needsStripeSecret: true,
  },
  {
    method: 'POST',
    path: '/admin/billing/customers/plan-labels',
    handler: handleBatchPlanLabels,
    needsStripeSecret: true,
  },
  {
    method: 'POST',
    path: /^\/admin\/billing\/invoices\/([^/]+)\/send-reminder$/,
    handler: handleSendInvoiceReminder,
    needsStripeSecret: true,
  },
  {
    method: 'GET',
    path: /^\/admin\/billing\/invoices\/([^/]+)$/,
    handler: handleGetInvoice,
    needsStripeSecret: true,
  },
  { method: 'GET', path: '/admin/finance-dashboard', handler: handleFinanceDashboard, needsStripeSecret: true },
  { method: 'GET', path: '/admin/subscription-rows', handler: handleListSubscriptionRows, needsStripeSecret: true },
  { method: 'GET', path: '/admin/payment-intents', handler: handleListPaymentIntents, needsStripeSecret: true },
  {
    method: 'GET',
    path: /^\/admin\/payment-intents\/([^/]+)$/,
    handler: handleGetPaymentIntentDetail,
    needsStripeSecret: true,
  },
  { method: 'GET', path: '/admin/invoices/recent', handler: handleRecentInvoices, needsStripeSecret: true },
  {
    method: 'POST',
    path: /^\/admin\/subscriptions\/([^/]+)\/cancel$/,
    handler: handleCancelSubscription,
    needsStripeSecret: true,
  },
  {
    method: 'POST',
    path: /^\/admin\/subscriptions\/([^/]+)\/pause$/,
    handler: handlePauseSubscription,
    needsStripeSecret: true,
  },
  {
    method: 'POST',
    path: /^\/admin\/subscriptions\/([^/]+)\/resume$/,
    handler: handleResumeSubscription,
    needsStripeSecret: true,
  },
  {
    method: 'POST',
    path: /^\/admin\/subscriptions\/([^/]+)\/change-price$/,
    handler: handleChangePrice,
    needsStripeSecret: true,
  },
  { method: 'POST', path: '/admin/plans/catalog-metadata', handler: handleCatalogMetadata, needsStripeSecret: true },
  { method: 'POST', path: '/admin/plans/product-active', handler: handleSetProductActive, needsStripeSecret: true },
  { method: 'POST', path: '/admin/plans/price-active', handler: handleSetPriceActive, needsStripeSecret: true },
  { method: 'POST', path: '/admin/plans/prices-major', handler: handleCreatePriceMajor, needsStripeSecret: true },
  {
    method: 'GET',
    path: '/admin/plans/team-billing',
    handler: handleTeamBillingGet,
    needsAppwrite: true,
  },
  {
    method: 'POST',
    path: '/admin/plans/team-billing',
    handler: handleTeamBillingSave,
    needsAppwrite: true,
  },
  {
    method: 'GET',
    path: '/admin/plans/personal-billing',
    handler: handlePersonalBillingGet,
    needsAppwrite: true,
  },
  {
    method: 'POST',
    path: '/admin/plans/personal-billing',
    handler: handlePersonalBillingSave,
    needsAppwrite: true,
  },
  {
    method: 'POST',
    path: '/admin/tools/reconcile-free-tier',
    handler: handleReconcileFreeTier,
    needsAppwrite: true,
    needsStripeSecret: true,
  },
  {
    method: 'GET',
    path: '/admin/tools/backfill-team-subscriptions',
    handler: handleBackfillTeamSubscriptionsGet,
    needsAppwrite: true,
  },
  {
    method: 'POST',
    path: '/admin/tools/backfill-team-subscriptions',
    handler: handleBackfillTeamSubscriptionsPost,
    needsAppwrite: true,
  },
  {
    method: 'POST',
    path: '/user-billing',
    handler: handleUserBillingDispatch,
    needsAuth: true,
    needsAppwrite: true,
    needsStripeSecret: true,
  },
  { method: 'POST', path: '/webhook', handler: handleWebhook, needsWebhookSecret: true, needsStripeSecret: true },
];

function paramNameForPattern(pathname: string, pattern: RegExp): Record<string, string> {
  const m = pathname.match(pattern);
  if (!m) return {};
  if (m[1]) return { id: decodeURIComponent(m[1]) };
  return {};
}

export function matchRoute(method: string, pathname: string): MatchedRoute | null {
  const m = method.toUpperCase() as HttpMethod;
  for (const def of ROUTES) {
    if (def.method !== m) continue;
    if (typeof def.path === 'string') {
      if (def.path === pathname) return { def, params: {} };
      continue;
    }
    if (def.path.test(pathname)) {
      return { def, params: paramNameForPattern(pathname, def.path) };
    }
  }
  return null;
}

export function routeNeedsStripeSecret(def: RouteDef): boolean {
  return def.needsStripeSecret !== false && def.path !== '/config';
}

export { ROUTES };
