/**
 * Client calls the Appwrite `stripe-api` function (`path` on the execution payload, e.g. `/admin/stats`).
 * Implement routes in `functions/stripe-api/` (see `handlers/router.js`). Shared TS types live under
 * `src/domains/admin/finance/types` and `src/types/stripeAdmin.ts` — the SPA calls this module → `stripe-api` only.
 *
 * Route → handler mapping (mirror in `functions/stripe-api`):
 * - `GET .../stats` → `getStripeAdminDashboardStats`
 * - `GET .../subscriptions` → `listStripeSubscriptionsForAdmin`
 * - `GET .../subscriptions/:id` → `getStripeSubscriptionForAdmin`
 * - `POST .../subscriptions/:id/actions` body `{ action, atPeriodEnd?: boolean }` (`cancel` + `atPeriodEnd: true` = end of period) → `runStripeSubscriptionAdminAction`
 * - `GET .../plans` → `listProductsAndPricesForAdmin`
 * - `GET .../plans/catalog` → `plansExt.listPlansForAdmin` (`functions/stripe-api/handlers/plansExt.js`)
 * - `GET .../plans/catalog/:productId` → `plansExt.getPlanDetailForAdmin` (`functions/stripe-api/handlers/plansExt.js`)
 * - `POST .../plans/products` → `createStripeProductAdmin` (name, description, optional `images`, `metadata`)
 * - `PATCH .../plans/products/:productId` → `updateStripeProductAdmin`
 * - `POST .../plans/prices` → `createStripePriceAdmin`
 * - `GET .../billing` → `getStripeAdminBillingOverview`
 * - `GET .../billing/customers/:customerId/subscriptions` → `listStripeSubscriptionsForCustomerAdmin` (admin)
 * - `POST .../billing/customers/plan-labels` body `{ customerIds: string[] }` → `batchCustomerPlanLabelsForAdmin` (admin)
 * - `GET .../billing/invoices/:invoiceId` → `getStripeInvoiceForAdmin` (returns `{ invoice }`)
 * - `POST .../billing/invoices/:invoiceId/send-reminder` → `sendStripeInvoiceReminderForAdmin`
 * - `GET .../finance-dashboard?period=` → `getAdminFinanceDashboard`
 * - `GET .../subscription-rows?...` → `listAdminSubscriptionRows`
 * - `GET .../payment-intents?...` → `listAdminPaymentIntentRows`
 * - `GET .../payment-intents/:id` → `getAdminPaymentIntentDetail`
 * - `GET .../invoices/recent?limit=` → `listAdminInvoicesRecent`
 * - `POST .../subscriptions/:id/cancel|pause|resume` → `adminCancelSubscription` / `adminPauseSubscription` / `adminResumeSubscription`
 * - `POST .../subscriptions/:id/change-price` → `adminUpdateSubscriptionPrice`
 * - `POST .../plans/catalog-metadata` → `updateAdminPlanProduct`
 * - `POST .../plans/product-active` → `setAdminProductActive`
 * - `POST .../plans/price-active` → `setAdminPriceActive`
 * - `POST .../plans/prices-major` → `createAdminPriceForProduct` (amount in major currency units)
 * - `GET|POST .../plans/team-billing` → team billing config (admin)
 * - `GET|POST .../plans/personal-billing` → personal free-tier price id in platform_settings (admin)
 * - `POST .../tools/reconcile-free-tier` body `{ limit?: number; cursorAfter?: string }` → ensure Stripe customers + free-tier subs (admin)
 * - `GET .../tools/backfill-team-subscriptions` → list team-plan Stripe subs missing an Appwrite `teams` row (admin)
 * - `POST .../tools/backfill-team-subscriptions` body `{ subscriptionIds: string[] }` → provision selected (admin)
 */
import type {
  AdminPlanDetailPayload,
  AdminTeamBillingGetPayload,
  AdminTeamBillingSavePayload,
  PersonalBillingConfig,
  TeamBillingConfig,
} from '@/domains/admin/finance/types';
import type {
  AdminFinanceDashboardResponse,
  AdminPaymentIntentDetail,
  AdminPaymentIntentRow,
  AdminSubscriptionRow,
  FinanceDashboardPeriod,
} from '@/domains/admin/finance/types';
import { fetchStripeJson, patchStripeJson, postStripeJson } from '@/lib/stripe-loader';
import type {
  AdminBillingOverviewPayload,
  AdminPlansCatalogListPayload,
  AdminPlansCatalogPayload,
  StripeAdminDashboardStats,
} from '@/types/stripeAdmin';

/** Paths are `stripe-api` router paths (e.g. `/admin/stats`), not full URLs. */
const A = '/admin' as const;

export function fetchAdminStats() {
  return fetchStripeJson<StripeAdminDashboardStats>(`${A}/stats`);
}

export function fetchAdminSubscriptions() {
  return fetchStripeJson<{ subscriptions: Record<string, unknown>[] }>(`${A}/subscriptions`);
}

export function fetchAdminSubscription(subscriptionId: string) {
  return fetchStripeJson<{ subscription: Record<string, unknown>; customer: Record<string, unknown> | null }>(
    `${A}/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
}

export function postAdminSubscriptionAction(
  subscriptionId: string,
  body: { action: 'cancel' | 'pause' | 'resume'; atPeriodEnd?: boolean },
) {
  return postStripeJson<{ subscription: Record<string, unknown> }>(
    `${A}/subscriptions/${encodeURIComponent(subscriptionId)}/actions`,
    body,
  );
}

export function fetchAdminPlansCatalog() {
  return fetchStripeJson<AdminPlansCatalogPayload>(`${A}/plans`);
}

export function fetchAdminCatalogPlans() {
  return fetchStripeJson<AdminPlansCatalogListPayload>(`${A}/plans/catalog`);
}

export function fetchAdminCatalogPlanDetail(productId: string) {
  return fetchStripeJson<AdminPlanDetailPayload>(
    `${A}/plans/catalog/${encodeURIComponent(productId)}`,
  );
}

export function fetchAdminTeamBilling() {
  return fetchStripeJson<AdminTeamBillingGetPayload>(`${A}/plans/team-billing`);
}

export function postAdminTeamBilling(body: { config: TeamBillingConfig }) {
  return postStripeJson<AdminTeamBillingSavePayload>(`${A}/plans/team-billing`, body);
}

export type AdminPersonalBillingGetPayload = {
  config: PersonalBillingConfig
}

export type AdminPersonalBillingSavePayload = {
  success: boolean
  config: PersonalBillingConfig
}

export function fetchAdminPersonalBilling() {
  return fetchStripeJson<AdminPersonalBillingGetPayload>(`${A}/plans/personal-billing`);
}

export function postAdminPersonalBilling(body: { config: PersonalBillingConfig }) {
  return postStripeJson<AdminPersonalBillingSavePayload>(`${A}/plans/personal-billing`, body);
}

export type AdminReconcileFreeTierResult = {
  success: boolean
  freePriceId: string
  note?: string
  accountRowsScanned: number
  limit: number
  done: boolean
  nextCursor: string | null
  processed: number
  customersCreated: number
  freeSubscriptionsCreated: number
  skippedPaid: number
  skippedAlreadyFree: number
  errors: { userId: string; message: string }[]
}

/** Admin: scan platform_db.accounts — create missing Stripe customers (prefs + accounts row), attach free-tier subscription when safe. */
export function postAdminToolsReconcileFreeTier(body?: { limit?: number; cursorAfter?: string }) {
  return postStripeJson<AdminReconcileFreeTierResult>(`${A}/tools/reconcile-free-tier`, body ?? {});
}

export type AdminMissingTeamCandidate = {
  subscriptionId: string
  status: string
  customerId: string
  customerEmail: string | null
  customerName: string | null
  productId: string | null
  productName: string | null
  teamName: string
  ownerUserId: string | null
  maxSeats: number | null
  proceedable: boolean
  blockReason: string | null
}

export type AdminMissingTeamSubscriptionsPayload = {
  success: boolean
  examined: number
  teamSubscriptions: number
  skippedHasRow: number
  skippedNotTeam: number
  candidates: AdminMissingTeamCandidate[]
}

/** Admin: scan active/trialing team-plan Stripe subscriptions with no matching `teams` document yet. */
export function fetchAdminToolsMissingTeamSubscriptions() {
  return fetchStripeJson<AdminMissingTeamSubscriptionsPayload>(`${A}/tools/backfill-team-subscriptions`);
}

export type AdminBackfillTeamSubscriptionsResult = {
  success: boolean
  examined: number
  teamSubscriptions: number
  skippedHasRow: number
  skippedNotTeam: number
  created: number
  skippedNotRequested: number
  errors: { subscriptionId: string; message: string }[]
}

/** Admin: provision Appwrite teams for the given Stripe subscription ids (must be eligible missing-team rows). */
export function postAdminToolsBackfillTeamSubscriptions(body: { subscriptionIds: string[] }) {
  return postStripeJson<AdminBackfillTeamSubscriptionsResult>(`${A}/tools/backfill-team-subscriptions`, body);
}

export function postAdminCreateProduct(body: {
  name: string
  description?: string
  images?: string[]
  metadata?: Record<string, string>
}) {
  /** Handler returns the Stripe `Product` JSON (top-level `id`), not `{ product }`. */
  return postStripeJson<Record<string, unknown>>(`${A}/plans/products`, body);
}

export function patchAdminProduct(productId: string, body: { name?: string; description?: string; active?: boolean }) {
  return patchStripeJson<{ product: Record<string, unknown> }>(
    `${A}/plans/products/${encodeURIComponent(productId)}`,
    body,
  );
}

export function postAdminCreatePrice(body: {
  productId: string;
  unit_amount: number;
  currency: string;
  interval: 'month' | 'year' | 'week' | 'day';
}) {
  return postStripeJson<{ price: Record<string, unknown> }>(`${A}/plans/prices`, body);
}

export function fetchAdminBillingOverview() {
  return fetchStripeJson<AdminBillingOverviewPayload>(`${A}/billing`);
}

/** Admin: Stripe subscriptions for `teams.stripe_customer_id` (Team detail). */
export function fetchAdminCustomerSubscriptions(customerId: string) {
  return fetchStripeJson<{ subscriptions: Record<string, unknown>[] }>(
    `${A}/billing/customers/${encodeURIComponent(customerId)}/subscriptions`,
  );
}

/** Admin: map `cus_…` ids → active subscription product name (batch for admin user list). */
export function postAdminCustomerPlanLabels(customerIds: string[]) {
  return postStripeJson<{ labels: Record<string, string | null> }>(`${A}/billing/customers/plan-labels`, {
    customerIds,
  });
}

export function fetchAdminInvoice(invoiceId: string) {
  return fetchStripeJson<{ invoice: Record<string, unknown> }>(
    `${A}/billing/invoices/${encodeURIComponent(invoiceId)}`,
  );
}

export function postAdminInvoiceSendReminder(invoiceId: string) {
  return postStripeJson<{ success: boolean }>(
    `${A}/billing/invoices/${encodeURIComponent(invoiceId)}/send-reminder`,
    {},
  );
}

export function fetchAdminFinanceDashboard(period: FinanceDashboardPeriod) {
  const q = new URLSearchParams({ period });
  return fetchStripeJson<AdminFinanceDashboardResponse>(`${A}/finance-dashboard?${q.toString()}`);
}

export function fetchAdminSubscriptionRows(params: {
  status?: string;
  productId?: string;
  priceId?: string;
  search?: string;
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  maxPages?: number;
}) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    q.set(k, String(v));
  }
  const qs = q.toString();
  return fetchStripeJson<{ subscriptions: AdminSubscriptionRow[]; fetchedPages: number }>(
    `${A}/subscription-rows${qs ? `?${qs}` : ''}`,
  );
}

export function fetchAdminPaymentIntents(params: { limit?: number; customer?: string; status?: string }) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    q.set(k, String(v));
  }
  const qs = q.toString();
  return fetchStripeJson<{ orders: AdminPaymentIntentRow[] }>(
    `${A}/payment-intents${qs ? `?${qs}` : ''}`,
  );
}

export function fetchAdminPaymentIntentDetail(paymentIntentId: string) {
  return fetchStripeJson<AdminPaymentIntentDetail>(
    `${A}/payment-intents/${encodeURIComponent(paymentIntentId)}`,
  );
}

export function fetchAdminInvoicesRecent(limit: number) {
  const q = new URLSearchParams({ limit: String(limit) });
  return fetchStripeJson<{ invoices: Record<string, unknown>[] }>(`${A}/invoices/recent?${q.toString()}`);
}

export function postAdminSubscriptionCancel(
  subscriptionId: string,
  body: { immediate?: boolean } = {},
) {
  return postStripeJson<{ success: boolean }>(
    `${A}/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    body,
  );
}

export function postAdminSubscriptionPause(
  subscriptionId: string,
  body: { behavior?: 'void' | 'mark_uncollectible' } = {},
) {
  return postStripeJson<{ success: boolean }>(
    `${A}/subscriptions/${encodeURIComponent(subscriptionId)}/pause`,
    body,
  );
}

export function postAdminSubscriptionResume(subscriptionId: string) {
  return postStripeJson<{ success: boolean }>(
    `${A}/subscriptions/${encodeURIComponent(subscriptionId)}/resume`,
    {},
  );
}

export function postAdminSubscriptionChangePrice(
  subscriptionId: string,
  body: {
    newPriceId: string;
    proration_behavior?: 'always_invoice' | 'none';
    sameProductOnly?: boolean;
  },
) {
  return postStripeJson<{ success: boolean }>(
    `${A}/subscriptions/${encodeURIComponent(subscriptionId)}/change-price`,
    body,
  );
}

export function postAdminPlanCatalogMetadata(body: {
  productId: string;
  name?: string;
  description?: string;
  sites_limit?: number | string | null;
  library_limit?: number | string | null;
  storage_limit?: number | string | null;
  non_sellable?: boolean;
  hidden?: boolean;
  /** Stripe metadata `type`: `personal plan` | `team plan`. */
  type?: string;
  seats_included?: number | string | null;
  /** Stripe metadata `plan_features` (max 500 chars). */
  plan_features?: string;
  /** Replaces product images (HTTPS URLs). */
  images?: string[];
}) {
  return postStripeJson<{ product: Record<string, unknown> }>(`${A}/plans/catalog-metadata`, body);
}

export function postAdminProductActive(body: { productId: string; active: boolean }) {
  return postStripeJson<{ product: Record<string, unknown> }>(`${A}/plans/product-active`, body);
}

export function postAdminPriceActive(body: { priceId: string; active: boolean }) {
  return postStripeJson<{ price: Record<string, unknown> }>(`${A}/plans/price-active`, body);
}

export function postAdminCreatePriceMajor(body: {
  productId: string;
  amount: number;
  interval: 'month' | 'year';
  currency?: string;
}) {
  return postStripeJson<{ price: Record<string, unknown> }>(`${A}/plans/prices-major`, {
    product_id: body.productId,
    amount: body.amount,
    interval: body.interval,
    currency: body.currency,
  });
}
