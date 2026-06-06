import { getStripe } from '../lib/stripeClient.ts';

function buildPlanFromProduct(product, pricesData) {
  const metadata = Object.entries(product.metadata || {}).map(([key, value]) => ({
    key,
    value: String(value),
  }));

  const allPrices = pricesData.map((pr) => ({
    id: pr.id,
    amount: pr.unit_amount != null ? pr.unit_amount / 100 : 0,
    currency: pr.currency || 'eur',
    interval: pr.recurring?.interval || 'one_time',
    interval_count: pr.recurring?.interval_count || 1,
    active: pr.active !== false,
  }));

  let monthlyPrice = 0;
  let yearlyPrice = 0;
  let monthlyPriceId = null;
  let yearlyPriceId = null;
  let currency = 'eur';

  for (const pr of pricesData) {
    if (!pr.recurring) continue;
    currency = pr.currency || currency;
    const amount = pr.unit_amount != null ? pr.unit_amount / 100 : 0;
    if (pr.recurring.interval === 'month') {
      monthlyPrice = amount;
      monthlyPriceId = pr.id;
    } else if (pr.recurring.interval === 'year') {
      yearlyPrice = amount;
      yearlyPriceId = pr.id;
    }
  }

  const catalogPlanType = (product.metadata && String(product.metadata.type || '').trim()) || '';
  const catalogImageUrl =
    Array.isArray(product.images) && product.images.length > 0 ? String(product.images[0]) : '';

  return {
    id: product.id,
    name: product.name,
    description: product.description || '',
    status: product.active ? 'active' : 'inactive',
    monthlyPrice,
    yearlyPrice,
    monthlyPriceId,
    yearlyPriceId,
    currency,
    metadata,
    allPrices,
    catalogPlanType: catalogPlanType || undefined,
    catalogImageUrl: catalogImageUrl || undefined,
    catalogCreated: typeof product.created === 'number' ? product.created : undefined,
    catalogUpdated: typeof product.updated === 'number' ? product.updated : undefined,
  };
}

async function countSubscriptionsByProduct(stripe) {
  const subIdsByProduct = new Map();
  let subscriptionCountsTruncated = false;
  const statuses = ['active', 'trialing', 'past_due', 'paused'];
  const maxPagesPerStatus = 8;

  for (const status of statuses) {
    let startingAfter;
    for (let page = 0; page < maxPagesPerStatus; page++) {
      const batch = await stripe.subscriptions.list({
        status,
        limit: 100,
        starting_after: startingAfter,
        expand: ['data.items.data.price'],
      });

      for (const sub of batch.data) {
        for (const item of sub.items.data) {
          const price = item.price;
          if (!price) continue;
          const pref = price.product;
          const productId = typeof pref === 'string' ? pref : pref?.id;
          if (!productId) continue;
          if (!subIdsByProduct.has(productId)) subIdsByProduct.set(productId, new Set());
          subIdsByProduct.get(productId).add(sub.id);
        }
      }

      if (!batch.has_more) break;
      if (batch.data.length === 0) break;
      startingAfter = batch.data[batch.data.length - 1].id;
      if (page === maxPagesPerStatus - 1 && batch.has_more) {
        subscriptionCountsTruncated = true;
      }
    }
  }

  const counts = {};
  for (const [productId, set] of subIdsByProduct.entries()) {
    counts[productId] = set.size;
  }
  return { counts, subscriptionCountsTruncated };
}

async function listPlansForAdmin(options) {
  const stripe = getStripe();
  let subCounts = null;
  let subscriptionCountsTruncated = false;
  if (options.includeCounts) {
    const counted = await countSubscriptionsByProduct(stripe);
    subCounts = counted.counts;
    subscriptionCountsTruncated = counted.subscriptionCountsTruncated;
  }

  const plans = [];
  let hasMore = true;
  let startingAfter;
  const maxProductPages = 10;

  for (let pPage = 0; pPage < maxProductPages && hasMore; pPage++) {
    const params = { limit: 100 };
    if (options.activeOnly) params.active = true;
    if (startingAfter) params.starting_after = startingAfter;

    const batch = await stripe.products.list(params);

    for (const product of batch.data) {
      if (options.excludeHidden && product.metadata?.hidden === 'true') continue;
      if (options.excludeNonSellable && product.metadata?.non_sellable === 'true') continue;

      const priceList = await stripe.prices.list({ product: product.id, limit: 100 });
      const row = buildPlanFromProduct(product, priceList.data);
      if (options.includeCounts) {
        row.activeSubscriptionsCount = subCounts ? subCounts[product.id] ?? 0 : 0;
      }
      plans.push(row);
    }

    hasMore = batch.has_more;
    if (batch.data.length > 0) {
      startingAfter = batch.data[batch.data.length - 1].id;
    } else {
      hasMore = false;
    }
  }

  return { plans, subscriptionCountsTruncated };
}

async function getPlanDetailForAdmin(productId) {
  const stripe = getStripe();
  const product = await stripe.products.retrieve(productId);
  const priceList = await stripe.prices.list({ product: productId, limit: 100 });
  const planBase = buildPlanFromProduct(product, priceList.data);
  const stripeLink = `https://dashboard.stripe.com/products/${encodeURIComponent(product.id)}`;
  const plan = {
    ...planBase,
    stripeLink,
    images: Array.isArray(product.images) ? product.images : [],
  };

  const statuses = ['active', 'trialing', 'past_due', 'paused'];
  const subscribers = [];
  let subscriptionsMonthly = 0;
  let subscriptionsYearly = 0;
  let totalEarningsCents = 0;

  for (const status of statuses) {
    let startingAfter;
    for (let page = 0; page < 15; page++) {
      const batch = await stripe.subscriptions.list({
        status,
        limit: 100,
        starting_after: startingAfter,
        expand: ['data.customer', 'data.items.data.price'],
      });

      for (const sub of batch.data) {
        let matchInterval = null;
        let matchAmountCents = 0;

        for (const item of sub.items?.data || []) {
          const pr = item.price;
          if (!pr) continue;
          const pref = pr.product;
          const pid = typeof pref === 'string' ? pref : pref?.id;
          if (pid !== productId) continue;
          if (pr.recurring?.interval === 'year') matchInterval = 'year';
          else if (pr.recurring?.interval === 'month') matchInterval = 'month';
          if (item.price?.unit_amount != null) {
            matchAmountCents = item.price.unit_amount;
          }
          break;
        }

        if (matchInterval == null) continue;

        if (matchInterval === 'year') subscriptionsYearly += 1;
        else subscriptionsMonthly += 1;

        totalEarningsCents += matchAmountCents;

        const cust = sub.customer;
        const customerId = typeof cust === 'string' ? cust : cust?.id ?? '';
        let email = '';
        let name = '';
        if (typeof cust === 'object' && cust !== null && !('deleted' in cust && cust.deleted)) {
          email = cust.email ?? '';
          name = cust.name ?? '';
        }
        const userId = sub.metadata?.appwrite_owner_id
          ? String(sub.metadata.appwrite_owner_id)
          : sub.metadata?.appwrite_user_id
            ? String(sub.metadata.appwrite_user_id)
            : null;

        subscribers.push({
          subscriptionId: sub.id,
          customerId,
          email,
          name,
          billingInterval: matchInterval,
          subscribedSince: sub.start_date,
          status: sub.status,
          userId,
        });
      }

      if (!batch.has_more || batch.data.length === 0) break;
      startingAfter = batch.data[batch.data.length - 1].id;
    }
  }

  const stats = {
    totalSubscriptions: subscribers.length,
    subscriptionsMonthly,
    subscriptionsYearly,
    totalEarnings: Math.round((totalEarningsCents / 100) * 100) / 100,
    upgradedTo: 0,
    downgradedTo: 0,
    downgradedFrom: 0,
  };

  return { plan, stats, subscribers };
}

async function updateAdminPlanProduct(productId, body) {
  const stripe = getStripe();
  const product = await stripe.products.retrieve(productId);
  const meta = { ...(product.metadata ?? {}) };
  if (body.sites_limit !== undefined) {
    if (body.sites_limit === '' || body.sites_limit === null) delete meta.sites_limit;
    else meta.sites_limit = String(body.sites_limit);
  }
  if (body.library_limit !== undefined) {
    if (body.library_limit === '' || body.library_limit === null) delete meta.library_limit;
    else meta.library_limit = String(body.library_limit);
  }
  if (body.storage_limit !== undefined) {
    if (body.storage_limit === '' || body.storage_limit === null) delete meta.storage_limit;
    else meta.storage_limit = String(body.storage_limit);
  }
  if (body.non_sellable !== undefined) meta.non_sellable = body.non_sellable ? 'true' : 'false';
  if (body.hidden !== undefined) meta.hidden = body.hidden ? 'true' : 'false';
  if (body.type !== undefined) {
    const t = String(body.type || '').trim();
    meta.type = t;
    if (t !== 'team plan') delete meta.seats_included;
  }
  if (body.seats_included !== undefined) {
    if (body.seats_included === '' || body.seats_included === null) delete meta.seats_included;
    else meta.seats_included = String(body.seats_included);
  }
  if (body.plan_features !== undefined) {
    const s = String(body.plan_features).slice(0, 500);
    if (!s.trim()) delete meta.plan_features;
    else meta.plan_features = s;
  }

  const updatePayload = {
    name: body.name ?? product.name,
    description: body.description !== undefined ? body.description : product.description ?? undefined,
    metadata: meta,
  };

  if (Array.isArray(body.images)) {
    const imgs = body.images.filter((u) => typeof u === 'string' && u.trim()).slice(0, 8);
    updatePayload.images = imgs;
  }

  return stripe.products.update(productId, updatePayload);
}

async function setAdminProductActive(productId, active) {
  const stripe = getStripe();
  return stripe.products.update(productId, { active });
}

async function setAdminPriceActive(priceId, active) {
  const stripe = getStripe();
  return stripe.prices.update(priceId, { active });
}

async function createAdminPriceForProduct(params) {
  const stripe = getStripe();
  const unit_amount = Math.round(params.amount * 100);
  const price = await stripe.prices.create({
    product: params.product_id,
    unit_amount,
    currency: (params.currency ?? 'eur').toLowerCase(),
    recurring: { interval: params.interval },
  });
  /** SPA expects `{ price }` (`postAdminCreatePriceMajor` / `useAdminCreatePrice`). */
  return { price };
}

export {
  listPlansForAdmin,
  getPlanDetailForAdmin,
  updateAdminPlanProduct,
  setAdminProductActive,
  setAdminPriceActive,
  createAdminPriceForProduct,
};