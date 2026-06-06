import { getStripe } from '../lib/stripeClient.ts';

async function listAdminPaymentIntentRows(params) {
  const stripeClient = getStripe();
  const lim = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const list = await stripeClient.paymentIntents.list({
    limit: lim,
    customer: params.customer,
    expand: ['data.customer', 'data.invoice'],
  });

  const listData = list.data;
  const data = params.status ? listData.filter((pi) => pi.status === params.status) : listData;

  const orders = data.map((pi) => {
    const cust = pi.customer;
    const customer =
      typeof cust === 'string'
        ? cust
        : cust && typeof cust === 'object' && 'id' in cust
          ? cust.id
          : null;
    let email = null;
    if (typeof cust === 'object' && cust !== null && !('deleted' in cust && cust.deleted)) {
      email = cust.email ?? null;
    }
    const inv = pi.invoice;
    const invoiceObj =
      typeof inv === 'object' && inv !== null && 'id' in inv ? inv : null;
    return {
      id: pi.id,
      amount: pi.amount,
      currency: pi.currency,
      status: pi.status ?? '',
      customer,
      email,
      date: pi.created,
      description: pi.description,
      invoice: invoiceObj
        ? {
            id: invoiceObj.id,
            hosted_invoice_url: invoiceObj.hosted_invoice_url ?? null,
            invoice_pdf: invoiceObj.invoice_pdf ?? null,
            number: invoiceObj.number ?? null,
          }
        : null,
    };
  });

  return { orders };
}

async function getAdminPaymentIntentDetail(paymentIntentId) {
  const stripeClient = getStripe();
  const pi = await stripeClient.paymentIntents.retrieve(paymentIntentId, {
    expand: ['customer', 'latest_charge', 'invoice'],
  });

  const cust = pi.customer;
  let customer = null;
  if (typeof cust === 'object' && cust !== null && !('deleted' in cust && cust.deleted)) {
    customer = { id: cust.id, email: cust.email ?? null, name: cust.name ?? null };
  }

  let charge = null;
  const lc = pi.latest_charge;
  if (typeof lc === 'object' && lc !== null && 'id' in lc) {
    const ch = lc;
    charge = {
      id: ch.id,
      amount: ch.amount,
      currency: ch.currency,
      status: ch.status ?? '',
      paid: ch.paid ?? false,
      receipt_url: ch.receipt_url ?? null,
      failure_code: ch.failure_code ?? null,
      failure_message: ch.failure_message ?? null,
      billing_details: ch.billing_details,
    };
  }

  return {
    success: true,
    paymentIntent: {
      id: pi.id,
      amount: pi.amount,
      amount_received: pi.amount_received ?? 0,
      currency: pi.currency,
      status: pi.status ?? '',
      created: pi.created,
      description: pi.description,
      receipt_email: pi.receipt_email ?? null,
      customer,
      metadata: pi.metadata ? { ...pi.metadata } : {},
      last_payment_error: pi.last_payment_error,
    },
    charge,
  };
}

export { listAdminPaymentIntentRows, getAdminPaymentIntentDetail };