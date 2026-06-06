import { postStripeJsonAuthed } from '@/lib/stripe-loader';

/** Stripe billing routes via `stripe-api` function (authed JWT). */
export const BILLING_ROUTES = {
  SUBSCRIPTION: '/user-billing/subscription',
  INVOICES: '/user-billing/invoices',
  PAYMENT_METHODS: '/user-billing/payment-methods',
} as const;

export { postStripeJsonAuthed };
