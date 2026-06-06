/**
 * Stripe allows at most 4 segments per `expand` path. Subscription *list* paths use `data.*`,
 * so `data.items.data.price.product` is invalid — expand to `data.items.data.price` and hydrate.
 *
 * @param {import('stripe').Stripe} stripe
 * @param {import('stripe').Stripe.Subscription[]} subscriptions
 */
async function hydrateSubscriptionFirstItemProducts(stripe, subscriptions) {
  if (!subscriptions.length) return;
  const ids = new Set();
  for (const sub of subscriptions) {
    const pid = sub.items?.data?.[0]?.price?.product;
    if (typeof pid === 'string') ids.add(pid);
  }
  if (ids.size === 0) return;
  /** @type {Map<string, import('stripe').Stripe.Product>} */
  const map = new Map();
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const p = await stripe.products.retrieve(id);
        if (!('deleted' in p && p.deleted)) map.set(id, p);
      } catch {
        // ignore
      }
    }),
  );
  for (const sub of subscriptions) {
    const price = sub.items?.data?.[0]?.price;
    if (price && typeof price.product === 'string') {
      const p = map.get(price.product);
      if (p) price.product = p;
    }
  }
}

/**
 * Invoice *list* paths cannot use `data.lines.data.price.product` (5 segments). Expand to
 * `data.lines.data.price` and attach Product objects here.
 *
 * @param {import('stripe').Stripe} stripe
 * @param {import('stripe').Stripe.Invoice[]} invoices
 */
async function hydrateInvoiceLineProducts(stripe, invoices) {
  if (!invoices.length) return;
  const ids = new Set();
  for (const inv of invoices) {
    for (const line of inv.lines?.data ?? []) {
      const price = line.price;
      if (price && typeof price === 'object' && typeof price.product === 'string') {
        ids.add(price.product);
      }
    }
  }
  if (ids.size === 0) return;
  /** @type {Map<string, import('stripe').Stripe.Product>} */
  const map = new Map();
  await Promise.all(
    [...ids].map(async (id) => {
      try {
        const p = await stripe.products.retrieve(id);
        if (!('deleted' in p && p.deleted)) map.set(id, p);
      } catch {
        // ignore
      }
    }),
  );
  for (const inv of invoices) {
    for (const line of inv.lines?.data ?? []) {
      const price = line.price;
      if (price && typeof price === 'object' && typeof price.product === 'string') {
        const p = map.get(price.product);
        if (p) price.product = p;
      }
    }
  }
}

export { hydrateSubscriptionFirstItemProducts, hydrateInvoiceLineProducts };