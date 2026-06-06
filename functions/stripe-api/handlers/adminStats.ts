import { getStripe } from '../lib/stripeClient.ts';

function recurringAmountToMonthlyCents(price, quantity) {
  if (price.unit_amount == null || !price.recurring) return 0;
  const line = price.unit_amount * quantity;
  switch (price.recurring.interval) {
    case 'month':
      return line;
    case 'year':
      return Math.round(line / 12);
    case 'week':
      return Math.round((line * 52) / 12);
    case 'day':
      return Math.round((line * 365) / 12);
    default:
      return line;
  }
}

function subscriptionMonthlyCents(sub) {
  let cents = 0;
  let currency;
  for (const item of sub.items.data) {
    const price = item.price;
    if (!price) continue;
    currency = price.currency;
    cents += recurringAmountToMonthlyCents(price, item.quantity ?? 1);
  }
  return { cents, currency };
}

function addMonthlyFromSubscription(mrr, sub) {
  const row = subscriptionMonthlyCents(sub);
  mrr.total += row.cents;
  if (!mrr.currency && row.currency) mrr.currency = row.currency;
}

async function getBillingAdminStats(stripe) {
  const mrr = { total: 0, currency: undefined };
  let activeSubscriptionCount = 0;
  let mrrSubCursor;
  for (let p = 0; p < 500; p++) {
    const subPage = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      starting_after: mrrSubCursor,
      expand: ['data.items.data.price'],
    });
    for (const sub of subPage.data) {
      activeSubscriptionCount += 1;
      addMonthlyFromSubscription(mrr, sub);
    }
    if (!subPage.has_more || subPage.data.length === 0) break;
    mrrSubCursor = subPage.data[subPage.data.length - 1].id;
  }
  return {
    mrrCents: mrr.total,
    activeSubscriptionCount,
    currency: (mrr.currency ?? 'usd').toLowerCase(),
  };
}

/**
 * GET /admin/stats — dashboard KPIs (mirrors src/api/stripe/admin.ts).
 */
async function getStripeAdminDashboardStats() {
  const stripe = getStripe();
  const base = await getBillingAdminStats(stripe);
  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;

  let livePayments24h = 0;
  let piCursor;
  for (let p = 0; p < 5; p++) {
    const piPage24h = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: dayAgo },
      starting_after: piCursor,
    });
    for (const pi of piPage24h.data) {
      if (pi.status === 'succeeded') livePayments24h += 1;
    }
    if (!piPage24h.has_more || piPage24h.data.length === 0) break;
    piCursor = piPage24h.data[piPage24h.data.length - 1].id;
  }

  let totalSubscriptions = 0;
  let subCursor;
  for (let p = 0; p < 15; p++) {
    const subPage = await stripe.subscriptions.list({
      status: 'all',
      limit: 100,
      starting_after: subCursor,
    });
    totalSubscriptions += subPage.data.length;
    if (!subPage.has_more || subPage.data.length === 0) break;
    subCursor = subPage.data[subPage.data.length - 1].id;
  }

  const sevenDaysAgo = now - 7 * 86400;
  let recentFailedPaymentIntents7d = 0;
  let failedPiCursor;
  for (let p = 0; p < 5; p++) {
    const failedPiPage = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: sevenDaysAgo },
      starting_after: failedPiCursor,
    });
    for (const pi of failedPiPage.data) {
      if (pi.last_payment_error || pi.status === 'requires_payment_method') recentFailedPaymentIntents7d += 1;
    }
    if (!failedPiPage.has_more || failedPiPage.data.length === 0) break;
    failedPiCursor = failedPiPage.data[failedPiPage.data.length - 1].id;
  }

  const thirtyDaysAgo = now - 30 * 86400;
  let revenueFromLast30PaidInvoicesCents = 0;
  let invCursor;
  for (let p = 0; p < 10; p++) {
    const paidInvPage = await stripe.invoices.list({
      status: 'paid',
      created: { gte: thirtyDaysAgo },
      limit: 100,
      starting_after: invCursor,
    });
    for (const inv of paidInvPage.data) {
      revenueFromLast30PaidInvoicesCents += inv.amount_paid ?? 0;
    }
    if (!paidInvPage.has_more || paidInvPage.data.length === 0) break;
    invCursor = paidInvPage.data[paidInvPage.data.length - 1].id;
  }

  return {
    ...base,
    livePayments24h,
    totalSubscriptions,
    recentFailedPaymentIntents7d,
    revenueFromLast30PaidInvoicesCents,
  };
}

export { getStripeAdminDashboardStats };