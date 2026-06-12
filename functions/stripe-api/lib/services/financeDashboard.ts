import { hydrateSubscriptionFirstItemProducts, hydrateInvoiceLineProducts } from '../hydrateSubscriptionProducts.ts';
import { getStripe } from '../stripeClient.ts';

const SEC = 86400;
/** Include invoices *created* up to this many seconds before the window; filter by *paid* time in-window (captures proration/upgrade settlement). */
const PAID_INVOICE_CREATED_LOOKBACK_SEC = 540 * SEC;

function getNowSec() {
  return Math.floor(Date.now() / 1000);
}

function utcStartOfDay(unix) {
  const d = new Date(unix * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000);
}

function startOfWeekMondayUtc(unix) {
  const d = new Date(unix * 1000);
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay();
  const mondayOffset = (dow + 6) % 7;
  d.setUTCDate(d.getUTCDate() - mondayOffset);
  return Math.floor(d.getTime() / 1000);
}

function startOfMonthUtc(unix) {
  const d = new Date(unix * 1000);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(1);
  return Math.floor(d.getTime() / 1000);
}

function startOfYearUtc(unix) {
  const d = new Date(unix * 1000);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCMonth(0, 1);
  return Math.floor(d.getTime() / 1000);
}

function lastCompleteCalendarMonthRange(nowSec) {
  const d = new Date(nowSec * 1000);
  const y0 = d.getUTCFullYear();
  const m0 = d.getUTCMonth();
  let y = y0;
  let m = m0 - 1;
  if (m < 0) {
    m = 11;
    y -= 1;
  }
  const start = Math.floor(Date.UTC(y, m, 1) / 1000);
  const end = Math.floor(Date.UTC(y, m + 1, 0, 23, 59, 59) / 1000);
  return { windowStart: start, windowEnd: end };
}

function lastCalendarYearRange(nowSec) {
  const d = new Date(nowSec * 1000);
  const y = d.getUTCFullYear() - 1;
  const start = Math.floor(Date.UTC(y, 0, 1) / 1000);
  const end = Math.floor(Date.UTC(y, 11, 31, 23, 59, 59) / 1000);
  return { windowStart: start, windowEnd: end };
}

/**
 * @param {number} windowStart
 * @param {number} windowEnd
 * @param {number} bucketCount
 * @param {(i: number, start: number) => string} bucketLabel
 */
function buildEqualBuckets(windowStart, windowEnd, bucketCount, bucketLabel) {
  const span = windowEnd - windowStart;
  const step = Math.max(1, Math.floor(span / Math.max(1, bucketCount)));
  const out = [];
  for (let i = 0; i < bucketCount; i++) {
    const start = windowStart + i * step;
    const end = i === bucketCount - 1 ? windowEnd : Math.min(windowStart + (i + 1) * step, windowEnd);
    out.push({ start, end, label: bucketLabel(i, start) });
  }
  return out;
}

/**
 * @param {number} windowStart
 * @param {number} windowEnd
 */
function buildUtcDayBounds(windowStart, windowEnd) {
  const out = [];
  let t0 = utcStartOfDay(windowStart);
  const we = windowEnd;
  if (t0 < windowStart) t0 = windowStart;
  while (t0 <= we) {
    const next = t0 + SEC;
    const isLast = next > we;
    const end = isLast ? we : next;
    out.push({
      start: t0,
      end,
      label: new Date(t0 * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    });
    t0 = next;
  }
  if (out.length === 0) {
    out.push({
      start: windowStart,
      end: we,
      label: new Date(windowStart * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    });
  }
  return out;
}

/**
 * @param {number} nowSec
 * @param {number} year
 */
function buildMonthBoundsForYearToDate(nowSec, year) {
  const d = new Date(nowSec * 1000);
  const mEnd = d.getUTCMonth();
  const out = [];
  for (let m = 0; m <= mEnd; m++) {
    const start = Math.floor(Date.UTC(year, m, 1) / 1000);
    const isLast = m === mEnd;
    const end = isLast ? nowSec : Math.floor(Date.UTC(year, m + 1, 1) / 1000);
    out.push({
      start,
      end,
      label: new Date(start * 1000).toLocaleString('en', { month: 'short' }),
    });
  }
  return out;
}

/**
 * @param {number} year
 */
function buildMonthBoundsForFullYear(year) {
  const out = [];
  for (let m = 0; m < 12; m++) {
    const start = Math.floor(Date.UTC(year, m, 1) / 1000);
    const isLast = m === 11;
    const end = isLast
      ? Math.floor(Date.UTC(year, 11, 31, 23, 59, 59) / 1000)
      : Math.floor(Date.UTC(year, m + 1, 1) / 1000);
    out.push({
      start,
      end,
      label: new Date(start * 1000).toLocaleString('en', { month: 'short' }),
    });
  }
  return out;
}

/**
 * @param {string} period
 */
function windowForPeriod(period) {
  const now = getNowSec();
  let rangeLabel;
  let windowStart;
  let windowEnd;
  let bounds;
  const resolved = (() => {
    if (period === 'day') return 'day';
    if (period === 'week') return 'this_week';
    if (period === 'month') return 'month_to_date';
    if (period === 'year') return 'year_to_date';
    return period;
  })();

  switch (resolved) {
    case 'this_week': {
      windowStart = startOfWeekMondayUtc(now);
      windowEnd = now;
      rangeLabel = 'This week (from Monday, UTC) to now';
      bounds = buildUtcDayBounds(windowStart, windowEnd);
      return { period: resolved, rangeLabel, windowStart, windowEnd, bounds };
    }
    case 'month_to_date': {
      windowStart = startOfMonthUtc(now);
      windowEnd = now;
      rangeLabel = 'This month to date (UTC)';
      bounds = buildUtcDayBounds(windowStart, windowEnd);
      return { period: resolved, rangeLabel, windowStart, windowEnd, bounds };
    }
    case 'last_month': {
      const r = lastCompleteCalendarMonthRange(now);
      windowStart = r.windowStart;
      windowEnd = r.windowEnd;
      rangeLabel = 'Last month (full calendar, UTC)';
      bounds = buildUtcDayBounds(windowStart, windowEnd);
      return { period: resolved, rangeLabel, windowStart, windowEnd, bounds };
    }
    case 'year_to_date': {
      const d = new Date(now * 1000);
      const y = d.getUTCFullYear();
      windowStart = Math.floor(Date.UTC(y, 0, 1) / 1000);
      windowEnd = now;
      rangeLabel = 'Year to date (UTC)';
      bounds = buildMonthBoundsForYearToDate(now, y);
      return { period: resolved, rangeLabel, windowStart, windowEnd, bounds };
    }
    case 'last_year': {
      const r = lastCalendarYearRange(now);
      windowStart = r.windowStart;
      windowEnd = r.windowEnd;
      rangeLabel = 'Last calendar year (UTC)';
      const d = new Date(windowStart * 1000);
      const y = d.getUTCFullYear();
      bounds = buildMonthBoundsForFullYear(y);
      return { period: resolved, rangeLabel, windowStart, windowEnd, bounds };
    }
    case 'day': {
      windowStart = now - SEC;
      windowEnd = now;
      rangeLabel = 'Last 24 hours';
      bounds = buildEqualBuckets(windowStart, windowEnd, 24, (i) => `H${String(i).padStart(2, '0')}`);
      return { period, rangeLabel, windowStart, windowEnd, bounds };
    }
    default: {
      const p = 'this_week';
      windowStart = startOfWeekMondayUtc(now);
      windowEnd = now;
      rangeLabel = 'This week (from Monday, UTC) to now';
      bounds = buildUtcDayBounds(windowStart, windowEnd);
      return { period: p, rangeLabel, windowStart, windowEnd, bounds };
    }
  }
}

function bucketIndexFor(t, bounds) {
  for (let i = 0; i < bounds.length; i++) {
    const last = i === bounds.length - 1;
    if (last) {
      if (t >= bounds[i].start && t <= bounds[i].end) return i;
    } else if (t >= bounds[i].start && t < bounds[i].end) {
      return i;
    }
  }
  return Math.min(bounds.length - 1, Math.max(0, bounds.length - 1));
}

/**
 * @param {import('stripe').Stripe.InvoiceLineItem} line
 * @param {import('stripe').Stripe.Invoice} inv
 */
function lineProductName(line, inv) {
  const pr = line.price;
  if (pr) {
    const prod = pr.product;
    if (typeof prod === 'string') return { id: prod, name: prod };
    if (prod && typeof prod === 'object' && 'name' in prod && typeof prod.name === 'string' && prod.name) {
      return { id: prod.id ?? '—', name: prod.name };
    }
    return { id: typeof prod === 'string' ? prod : '—', name: 'Other' };
  }
  if (line.proration) {
    return { id: '__proration__', name: 'Upgrades & proration' };
  }
  if (inv.billing_reason === 'subscription_update') {
    return { id: '__subscription_update__', name: 'Upgrades & proration' };
  }
  return { id: '—', name: 'Other' };
}

function addCentsToMap(map, key, name, cents) {
  if (!cents) return;
  const cur = map.get(key) ?? { productId: key, name, revenueCents: 0 };
  cur.revenueCents += cents;
  if (name && name !== 'Other') cur.name = name;
  map.set(key, cur);
}

/**
 * @param {import('stripe').Stripe.Invoice} inv
 * @param {Map<string, { productId: string; name: string; revenueCents: number }>} revenueByPlan
 */
function addInvoiceToRevenueByPlan(inv, revenueByPlan) {
  const lines = inv.lines?.data ?? [];
  const ap = inv.amount_paid ?? 0;
  if (ap === 0) return;
  if (lines.length === 0) {
    if (inv.billing_reason === 'subscription_update') {
      addCentsToMap(revenueByPlan, '__subscription_update__', 'Upgrades & proration', ap);
    } else {
      addCentsToMap(revenueByPlan, '—', 'Other', ap);
    }
    return;
  }
  const lineSum = lines.reduce((acc, line) => acc + (line.amount ?? 0), 0);
  if (lineSum <= 0) {
    if (ap > 0 && inv.billing_reason === 'subscription_update') {
      addCentsToMap(revenueByPlan, '__subscription_update__', 'Upgrades & proration', ap);
    } else {
      addCentsToMap(revenueByPlan, '—', 'Other', ap);
    }
    return;
  }
  for (const line of lines) {
    const a = line.amount ?? 0;
    if (a === 0) continue;
    const { id, name } = lineProductName(line, inv);
    const share = Math.round((a / lineSum) * ap);
    addCentsToMap(revenueByPlan, id, name, share);
  }
}

async function getAdminFinanceDashboard(period) {
  const stripeClient = getStripe();
  const { period: periodResolved, windowStart, windowEnd, rangeLabel, bounds } = windowForPeriod(period);
  const bucketCount = bounds.length;
  if (bucketCount === 0) {
    return { success: false, error: 'No time buckets' };
  }

  const revenueByBucket = new Array(bucketCount).fill(0);
  const newByBucket = new Array(bucketCount).fill(0);
  const cancelByBucket = new Array(bucketCount).fill(0);
  const upgradeByBucket = new Array(bucketCount).fill(0);
  const revenueByPlan = new Map();
  let currency = 'eur';
  const createdGte = Math.max(0, windowStart - PAID_INVOICE_CREATED_LOOKBACK_SEC);
  /** @type {Array<{ inv: import('stripe').Stripe.Invoice; paidT: number }>} */
  const paidInWindowForRecent = [];
  let revenueInPeriodUpgradesCents = 0;

  let invStart;
  for (let p = 0; p < 50; p++) {
    const page = await stripeClient.invoices.list({
      status: 'paid',
      created: { gte: createdGte, lte: windowEnd },
      limit: 100,
      starting_after: invStart,
      expand: ['data.lines.data.price'],
    });
    await hydrateInvoiceLineProducts(stripeClient, page.data);
    for (const inv of page.data) {
      const paidT = inv.status_transitions?.paid_at ?? inv.created;
      if (paidT < windowStart || paidT > windowEnd) continue;
      const bi = bucketIndexFor(paidT, bounds);
      const paid = inv.amount_paid ?? 0;
      revenueByBucket[bi] += paid;
      if (inv.billing_reason === 'subscription_update') {
        upgradeByBucket[bi] += 1;
        revenueInPeriodUpgradesCents += paid;
      }
      if (inv.currency) {
        currency = String(inv.currency).toLowerCase();
      }
      addInvoiceToRevenueByPlan(inv, revenueByPlan);
      paidInWindowForRecent.push({ inv, paidT });
    }
    if (!page.has_more || page.data.length === 0) break;
    invStart = page.data[page.data.length - 1].id;
  }

  let nStart;
  for (let p = 0; p < 100; p++) {
    const batch = await stripeClient.subscriptions.list({
      status: 'all',
      created: { gte: windowStart, lte: windowEnd },
      limit: 100,
      starting_after: nStart,
    });
    for (const sub of batch.data) {
      const c = sub.created;
      const bi = bucketIndexFor(c, bounds);
      newByBucket[bi] += 1;
    }
    if (!batch.has_more || batch.data.length === 0) break;
    nStart = batch.data[batch.data.length - 1].id;
  }

  let subStart;
  for (let page = 0; page < 20; page++) {
    const batch = await stripeClient.subscriptions.list({
      status: 'all',
      limit: 100,
      starting_after: subStart,
      expand: ['data.customer', 'data.items.data.price'],
    });
    for (const sub of batch.data) {
      const ca = sub.canceled_at;
      if (ca != null && ca >= windowStart && ca <= windowEnd) {
        const bi = bucketIndexFor(ca, bounds);
        cancelByBucket[bi] += 1;
      }
    }
    if (!batch.has_more || batch.data.length === 0) break;
    subStart = batch.data[batch.data.length - 1].id;
  }

  const buckets = bounds.map((b, i) => ({
    label: b.label,
    start: b.start,
    end: b.end,
    revenueCents: revenueByBucket[i] ?? 0,
    newSubscriptions: newByBucket[i] ?? 0,
    cancellations: cancelByBucket[i] ?? 0,
    upgrades: upgradeByBucket[i] ?? 0,
    downgrades: 0,
    cumulativeNetSubscriptions: 0,
  }));

  let cum = 0;
  for (const row of buckets) {
    cum += row.newSubscriptions - row.cancellations;
    row.cumulativeNetSubscriptions = cum;
  }

  let revenueInPeriodCents = 0;
  for (const b of buckets) {
    revenueInPeriodCents += b.revenueCents;
  }

  let activeSubscriptionsNow = 0;
  let actStart;
  for (let page = 0; page < 5; page++) {
    const batch = await stripeClient.subscriptions.list({
      status: 'active',
      limit: 100,
      starting_after: actStart,
    });
    activeSubscriptionsNow += batch.data.length;
    if (!batch.has_more || batch.data.length === 0) break;
    actStart = batch.data[batch.data.length - 1].id;
  }

  const newInPeriod = newByBucket.reduce((a, n) => a + n, 0);
  const canceledInPeriod = cancelByBucket.reduce((a, n) => a + n, 0);

  let revenueAllTimeCents = 0;
  let invAll;
  for (let p = 0; p < 5; p++) {
    const page = await stripeClient.invoices.list({ status: 'paid', limit: 100, starting_after: invAll });
    for (const inv of page.data) {
      revenueAllTimeCents += inv.amount_paid ?? 0;
    }
    if (!page.has_more || page.data.length === 0) break;
    invAll = page.data[page.data.length - 1].id;
  }

  let unpaidOpenCount = 0;
  let unpaidOpenCents = 0;
  let openInv;
  for (let p = 0; p < 20; p++) {
    const page = await stripeClient.invoices.list({ status: 'open', limit: 100, starting_after: openInv });
    for (const inv of page.data) {
      unpaidOpenCount += 1;
      unpaidOpenCents += inv.amount_due ?? 0;
    }
    if (!page.has_more || page.data.length === 0) break;
    openInv = page.data[page.data.length - 1].id;
  }

  const productCounts = new Map();
  let prodStart;
  for (let page = 0; page < 8; page++) {
    const batch = await stripeClient.subscriptions.list({
      status: 'active',
      limit: 100,
      starting_after: prodStart,
      expand: ['data.items.data.price'],
    });
    await hydrateSubscriptionFirstItemProducts(stripeClient, batch.data);
    for (const sub of batch.data) {
      const item = sub.items.data[0];
      const pr = item?.price?.product;
      const pid = typeof pr === 'string' ? pr : pr && 'id' in pr ? pr.id : null;
      const name = typeof pr === 'object' && pr && 'name' in pr && typeof pr.name === 'string' ? pr.name : pid ?? '—';
      if (!pid) continue;
      const cur = productCounts.get(pid) ?? { name, count: 0 };
      cur.count += 1;
      productCounts.set(pid, cur);
    }
    if (!batch.has_more || batch.data.length === 0) break;
    prodStart = batch.data[batch.data.length - 1].id;
  }

  const byPlan = [...productCounts.entries()].map(([productId, v]) => ({
    productId,
    name: v.name,
    count: v.count,
  }));

  const revenueByPlanList = [...revenueByPlan.values()]
    .filter((r) => r.revenueCents > 0)
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .map((r) => ({ productId: r.productId, name: r.name, revenueCents: r.revenueCents }));

  const recentPaidInvoicesRaw = [];
  let recentStart;
  for (let p = 0; p < 5; p++) {
    const page = await stripeClient.invoices.list({
      status: 'paid',
      created: { gte: windowStart, lte: windowEnd },
      limit: 25,
      starting_after: recentStart,
      expand: ['data.lines.data.price'],
    });
    await hydrateInvoiceLineProducts(stripeClient, page.data);
    for (const inv of page.data) {
      const cust = inv.customer;
      const customerId = typeof cust === 'string' ? cust : cust && 'id' in cust ? cust.id : null;
      let customerDisplayName = '—';
      if (typeof cust === 'object' && cust && !('deleted' in cust && cust.deleted)) {
        customerDisplayName = cust.name?.trim() || cust.email?.trim() || cust.id;
      }
      let subscriptionId = null;
      if (inv.subscription) {
        subscriptionId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription.id ?? null;
      }
      const paidAt = inv.status_transitions?.paid_at ?? inv.created;
      recentPaidInvoicesRaw.push({
        id: inv.id,
        number: inv.number,
        amount_paid: inv.amount_paid ?? 0,
        currency: inv.currency,
        created: inv.created,
        paidAt: paidAt ?? inv.created,
        customerId,
        customerDisplayName,
        subscriptionId,
      });
    }
    if (!page.has_more || page.data.length === 0) break;
    recentStart = page.data[page.data.length - 1].id;
  }

  recentPaidInvoicesRaw.sort((a, b) => b.paidAt - a.paidAt);
  const recentPaidInvoices = recentPaidInvoicesRaw.slice(0, 10).map(({ paidAt, ...r }) => r);

  const recentSubRows = await stripeClient.subscriptions.list({
    status: 'all',
    created: { gte: windowStart, lte: windowEnd },
    limit: 10,
    expand: ['data.customer', 'data.items.data.price'],
  });
  await hydrateSubscriptionFirstItemProducts(stripeClient, recentSubRows.data);
  const recentSubscriptions = recentSubRows.data
    .sort((a, b) => b.created - a.created)
    .map((sub) => {
      const item = sub.items.data[0];
      const pr = item?.price?.product;
      const product =
        typeof pr === 'string'
          ? { name: pr }
          : pr && typeof pr === 'object'
            ? { name: 'name' in pr && pr.name ? pr.name : pr.id }
            : { name: '—' };
      const planName = product.name ?? '—';
      const cust = sub.customer;
      const customerId = typeof cust === 'string' ? cust : cust && 'id' in cust ? cust.id : null;
      let customerDisplayName = '—';
      if (typeof cust === 'object' && cust && !('deleted' in cust && cust.deleted)) {
        customerDisplayName = cust.name?.trim() || cust.email?.trim() || cust.id;
      }
      const price = item?.price;
      const amountCents = price && typeof price.unit_amount === 'number' ? price.unit_amount * (item.quantity ?? 1) : 0;
      return {
        id: sub.id,
        created: sub.created,
        status: sub.status,
        subscriptionId: sub.id,
        customerId,
        customerDisplayName,
        planName,
        amountCents,
        currency: (price && price.currency) || currency,
        currentPeriodEnd: sub.current_period_end,
      };
    });

  return {
    success: true,
    period: periodResolved,
    rangeLabel,
    windowStart,
    windowEnd,
    currency: currency || 'eur',
    recentPaidInvoices,
    recentSubscriptionChanges: [],
    recentSubscriptions,
    stats: {
      buckets,
      kpis: {
        activeSubscriptionsNow,
        newInPeriod,
        canceledInPeriod,
        revenueInPeriodCents,
        revenueAllTimeCents,
        revenueAllTimeTruncated: true,
        upgradesInPeriod: upgradeByBucket.reduce((a, n) => a + n, 0),
        downgradesInPeriod: 0,
        revenueInPeriodUpgradesCents: revenueInPeriodUpgradesCents,
        unpaidOpenInvoicesCount: unpaidOpenCount,
        unpaidOpenInvoicesCents: unpaidOpenCents,
      },
      byPlan,
      revenueByPlan: revenueByPlanList,
      truncated: true,
      upgradeDowngradeNote:
        'Downgrade-only activity is not itemized. Upgrade and proration revenue is included; period is based on paid time.',
      rangeLabel,
    },
  };
}

export { getAdminFinanceDashboard };