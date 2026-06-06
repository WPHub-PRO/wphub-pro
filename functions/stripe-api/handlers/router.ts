import { createServerClientAndDatabases } from '@code045/wphubpro-shared';
import { normalizePath, splitPathAndQuery } from '../lib/pathUtils.ts';
import { resolveExecutorUserId } from '../lib/resolveExecutorUser.ts';
import { getPublishableConfig } from './config.ts';
import { getStripeAdminDashboardStats } from './adminStats.ts';
import adminStripe from './adminStripe.ts';
import plansExt from './plansExt.ts';
import teamBillingAdmin from './teamBillingAdmin.ts';
import personalBillingAdmin from './personalBillingAdmin.ts';
import { reconcileFreeTierAndCustomers } from './adminReconcileFreeTier.ts';
import adminTools from './adminTools.ts';
import adminOps from './adminSubscriptionOps.ts';
import { getAdminFinanceDashboard } from './financeDashboard.ts';
import { listAdminSubscriptionRows } from './subscriptionRows.ts';
import { listAdminPaymentIntentRows, getAdminPaymentIntentDetail } from './paymentIntentsFull.ts';
import { runUserBillingAction } from './userBilling.ts';
import accountStripe from './accountStripeRoutes.ts';
import { notifySubscriptionChangeIfPossible } from '../lib/pushUserNotification.ts';
import { handleStripeWebhook } from './stripeWebhook.ts';
import { internalTeamSubscriptionCancel } from './internalTeamSubscriptionCancel.ts';

/**
 * @param {object} ctx
 * @param {object} ctx.req
 * @param {string} ctx.path
 * @param {string} ctx.method
 * @param {unknown} ctx.body
 */
async function routeStripeRequest(ctx) {
  const { req, path: rawPath, method: rawMethod, body } = ctx;
  const { pathname: p0, searchParams } = splitPathAndQuery(rawPath || '');
  const p = normalizePath(p0);
  const m = (rawMethod || 'GET').toUpperCase();

  /** @type {ReturnType<typeof createServerClientAndDatabases> extends Promise<infer R> ? R : never} | null} */
  let appwrite = null;
  const getAppwrite = async () => {
    if (!appwrite) {
      appwrite = await createServerClientAndDatabases({ req });
    }
    return appwrite;
  };

  if (p === '/config' && m === 'GET') {
    return getPublishableConfig();
  }

  /** Server-to-server from `users` team delete — requires `X-WPHUB-Internal-Key` + ownership check (see handler). */
  if (p === '/internal/team-subscription/cancel' && m === 'POST') {
    const { databases } = await getAppwrite();
    return internalTeamSubscriptionCancel({
      req,
      databases,
      body: body && typeof body === 'object' ? body : {},
    });
  }

  if (p === '/admin/stats' && m === 'GET') {
    return getStripeAdminDashboardStats();
  }

  /** Public catalog — `src/hooks/usePlans` → `GET /plans`. */
  if (p === '/plans' && m === 'GET') {
    return accountStripe.getPublicCatalogPlans();
  }

  /** Account — `src/hooks/useSubscription` / `useInvoices` (requires session + prefs match). */
  if (p === '/subscriptions' && m === 'GET') {
    const customerId = searchParams.get('customerId');
    if (!customerId?.trim()) {
      throw Object.assign(new Error('customerId query parameter is required'), { statusCode: 400 });
    }
    const userId = await resolveExecutorUserId(req);
    if (!userId) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    }
    return accountStripe.listCustomerSubscriptions(userId, customerId.trim(), req);
  }

  if (p === '/billing' && m === 'GET') {
    const customerId = searchParams.get('customerId');
    if (!customerId?.trim()) {
      throw Object.assign(new Error('customerId query parameter is required'), { statusCode: 400 });
    }
    const userId = await resolveExecutorUserId(req);
    if (!userId) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    }
    return accountStripe.listCustomerInvoices(userId, customerId.trim(), req);
  }

  /** `src/hooks/useSubscription` mutation — `POST /subscriptions`. */
  if (p === '/subscriptions' && m === 'POST') {
    const userId = await resolveExecutorUserId(req);
    if (!userId) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
    }
    return accountStripe.postAccountSubscriptions(userId, body && typeof body === 'object' ? body : {}, req);
  }

  if (p === '/admin/subscriptions' && m === 'GET') {
    return adminStripe.listStripeSubscriptionsForAdmin();
  }

  {
    const match = p.match(/^\/admin\/subscriptions\/([^/]+)$/);
    if (match && m === 'GET') {
      return adminStripe.getStripeSubscriptionForAdmin(decodeURIComponent(match[1]));
    }
  }

  {
    const match = p.match(/^\/admin\/subscriptions\/([^/]+)\/actions$/);
    if (match && m === 'POST') {
      const b = body && typeof body === 'object' ? body : {};
      const action = b.action;
      if (action !== 'cancel' && action !== 'pause' && action !== 'resume') {
        throw Object.assign(new Error('Invalid action'), { code: 'BAD_REQUEST', statusCode: 400 });
      }
      return adminStripe.runStripeSubscriptionAdminAction(decodeURIComponent(match[1]), action, {
        cancelAtPeriodEnd: b.atPeriodEnd === true,
      });
    }
  }

  if (p === '/admin/plans' && m === 'GET') {
    return adminStripe.listProductsAndPricesForAdmin();
  }

  if (p === '/admin/plans/catalog' && m === 'GET') {
    return plansExt.listPlansForAdmin({
      activeOnly: false,
      excludeHidden: false,
      excludeNonSellable: false,
      includeCounts: true,
    });
  }

  {
    const match = p.match(/^\/admin\/plans\/catalog\/([^/]+)$/);
    if (match && m === 'GET') {
      return plansExt.getPlanDetailForAdmin(decodeURIComponent(match[1]));
    }
  }

  if (p === '/admin/plans/products' && m === 'POST') {
    return adminStripe.createStripeProductAdmin(body || {});
  }

  {
    const match = p.match(/^\/admin\/plans\/products\/([^/]+)$/);
    if (match && m === 'PATCH') {
      return adminStripe.updateStripeProductAdmin(decodeURIComponent(match[1]), body || {});
    }
  }

  if (p === '/admin/plans/prices' && m === 'POST') {
    return adminStripe.createStripePriceAdmin(body || {});
  }

  if (p === '/admin/billing' && m === 'GET') {
    return adminStripe.getStripeAdminBillingOverview();
  }

  {
    const match = p.match(/^\/admin\/billing\/customers\/([^/]+)\/subscriptions$/);
    if (match && m === 'GET') {
      return adminStripe.listStripeSubscriptionsForCustomerAdmin(ctx.req, decodeURIComponent(match[1]));
    }
  }

  if (p === '/admin/billing/customers/plan-labels' && m === 'POST') {
    return adminStripe.batchCustomerPlanLabelsForAdmin(ctx.req, body && typeof body === 'object' ? body : {});
  }

  {
    const match = p.match(/^\/admin\/billing\/invoices\/([^/]+)\/send-reminder$/);
    if (match && m === 'POST') {
      return adminStripe.sendStripeInvoiceReminderForAdmin(decodeURIComponent(match[1]));
    }
  }

  {
    const match = p.match(/^\/admin\/billing\/invoices\/([^/]+)$/);
    if (match && m === 'GET') {
      return adminStripe.getStripeInvoiceForAdmin(decodeURIComponent(match[1]));
    }
  }

  if (p === '/admin/finance-dashboard' && m === 'GET') {
    const period = searchParams.get('period') || 'week';
    return getAdminFinanceDashboard(period);
  }

  if (p === '/admin/subscription-rows' && m === 'GET') {
    const params = {
      status: searchParams.get('status') || undefined,
      productId: searchParams.get('productId') || undefined,
      priceId: searchParams.get('priceId') || undefined,
      search: searchParams.get('search') || undefined,
      sortField: searchParams.get('sortField') || undefined,
      sortDir: searchParams.get('sortDir') || undefined,
      maxPages: searchParams.get('maxPages') ? Number(searchParams.get('maxPages')) : undefined,
    };
    return listAdminSubscriptionRows(params);
  }

  if (p === '/admin/payment-intents' && m === 'GET') {
    const params = {
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined,
      customer: searchParams.get('customer') || undefined,
      status: searchParams.get('status') || undefined,
    };
    return listAdminPaymentIntentRows(params);
  }

  {
    const match = p.match(/^\/admin\/payment-intents\/([^/]+)$/);
    if (match && m === 'GET') {
      return getAdminPaymentIntentDetail(decodeURIComponent(match[1]));
    }
  }

  if (p === '/admin/invoices/recent' && m === 'GET') {
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 25;
    return adminStripe.listAdminInvoicesRecent(limit);
  }

  {
    const match = p.match(/^\/admin\/subscriptions\/([^/]+)\/cancel$/);
    if (match && m === 'POST') {
      const subId = decodeURIComponent(match[1]);
      const out = await adminOps.adminCancelSubscription({
        subscriptionId: subId,
        immediate: !!(body && body.immediate),
      });
      await notifySubscriptionChangeIfPossible(ctx.req, { subscriptionId: subId, action: 'cancel' });
      return out;
    }
  }

  {
    const match = p.match(/^\/admin\/subscriptions\/([^/]+)\/pause$/);
    if (match && m === 'POST') {
      const subId = decodeURIComponent(match[1]);
      const out = await adminOps.adminPauseSubscription({
        subscriptionId: subId,
        behavior: body?.behavior,
      });
      await notifySubscriptionChangeIfPossible(ctx.req, { subscriptionId: subId, action: 'pause' });
      return out;
    }
  }

  {
    const match = p.match(/^\/admin\/subscriptions\/([^/]+)\/resume$/);
    if (match && m === 'POST') {
      const subId = decodeURIComponent(match[1]);
      const out = await adminOps.adminResumeSubscription(subId);
      await notifySubscriptionChangeIfPossible(ctx.req, { subscriptionId: subId, action: 'resume' });
      return out;
    }
  }

  {
    const match = p.match(/^\/admin\/subscriptions\/([^/]+)\/change-price$/);
    if (match && m === 'POST') {
      const b = body && typeof body === 'object' ? body : {};
      const subId = decodeURIComponent(match[1]);
      const out = await adminOps.adminUpdateSubscriptionPrice({
        subscriptionId: subId,
        newPriceId: String(b.newPriceId ?? ''),
        proration_behavior: b.proration_behavior,
        sameProductOnly: b.sameProductOnly,
      });
      await notifySubscriptionChangeIfPossible(ctx.req, { subscriptionId: subId, action: 'price' });
      return out;
    }
  }

  if (p === '/admin/plans/catalog-metadata' && m === 'POST') {
    const b = body && typeof body === 'object' ? body : {};
    return plansExt.updateAdminPlanProduct(String(b.productId ?? ''), b);
  }

  if (p === '/admin/plans/product-active' && m === 'POST') {
    const b = body && typeof body === 'object' ? body : {};
    return plansExt.setAdminProductActive(String(b.productId ?? ''), !!b.active);
  }

  if (p === '/admin/plans/price-active' && m === 'POST') {
    const b = body && typeof body === 'object' ? body : {};
    return plansExt.setAdminPriceActive(String(b.priceId ?? ''), !!b.active);
  }

  if (p === '/admin/plans/prices-major' && m === 'POST') {
    const b = body && typeof body === 'object' ? body : {};
    return plansExt.createAdminPriceForProduct({
      product_id: String(b.product_id ?? ''),
      amount: Number(b.amount),
      interval: b.interval,
      currency: b.currency,
    });
  }

  if (p === '/admin/plans/team-billing' && m === 'GET') {
    const app = await getAppwrite();
    return teamBillingAdmin.getTeamBillingAdmin({ req, ...app });
  }

  if (p === '/admin/plans/team-billing' && m === 'POST') {
    const b = body && typeof body === 'object' ? body : {};
    const app = await getAppwrite();
    return teamBillingAdmin.saveTeamBillingAdmin({ req, body: b, ...app });
  }

  if (p === '/admin/plans/personal-billing' && m === 'GET') {
    const app = await getAppwrite();
    return personalBillingAdmin.getPersonalBillingAdmin({ req, ...app });
  }

  if (p === '/admin/plans/personal-billing' && m === 'POST') {
    const b = body && typeof body === 'object' ? body : {};
    const app = await getAppwrite();
    return personalBillingAdmin.savePersonalBillingAdmin({ req, body: b, ...app });
  }

  if (p === '/admin/tools/reconcile-free-tier' && m === 'POST') {
    const b = body && typeof body === 'object' ? body : {};
    const app = await getAppwrite();
    return reconcileFreeTierAndCustomers({ req, body: b, ...app });
  }

  if (p === '/admin/tools/backfill-team-subscriptions' && m === 'GET') {
    const app = await getAppwrite();
    return adminTools.listMissingTeamWorkspaceSubscriptions({ req, ...app });
  }

  if (p === '/admin/tools/backfill-team-subscriptions' && m === 'POST') {
    const b = body && typeof body === 'object' ? body : {};
    const app = await getAppwrite();
    return adminTools.backfillTeamWorkspacesFromStripe({ req, body: b, ...app });
  }

  if (p === '/user-billing' && m === 'POST') {
    const userId = await resolveExecutorUserId(req);
    if (!userId) {
      throw Object.assign(new Error('Unauthorized — no executor user id'), { statusCode: 401 });
    }
    return runUserBillingAction(req, userId, body && typeof body === 'object' ? body : {});
  }

  /** Stripe Dashboard webhook — raw body + `Stripe-Signature` required (see `handlers/stripeWebhook.js`). */
  if (p === '/webhook' && m === 'POST') {
    return handleStripeWebhook({ req, body });
  }

  const err = new Error(`Stripe route not implemented in stripe-api: ${m} ${p || '(empty path)'}`);
  err.code = 'NOT_IMPLEMENTED';
  err.statusCode = 501;
  throw err;
}

export { routeStripeRequest };