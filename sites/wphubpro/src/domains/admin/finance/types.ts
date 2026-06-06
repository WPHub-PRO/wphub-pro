export type AdminSubscriptionRow = {
  subscriptionId: string
  status: string
  startDate: number
  endDate: number | null
  currentPeriodEnd: number
  nextBillingDate: number
  billingCycle: string | null
  billingIntervalCount: number
  planName: string | null
  priceId: string | null
  productId: string | null
  customerId: string | null
  customerEmail: string | null
  customerName: string | null
  cancelAtPeriodEnd: boolean
  hubArchived: boolean
  userId: string | null
  username: string | null
}

export type AdminFinanceSummary = {
  success: boolean
  subscriptionCountsByStatus: Record<string, number>
  approximateMrrCents: number
  approximateMrr: number
  note?: string
  recentFailedPaymentIntents7d: number
  lastPaidInvoicesSample: Array<{
    id: string
    amount_paid: number
    currency: string
    created: number
    customer: string | null
  }>
  revenueFromLast30PaidInvoicesCents: number
}

export type AdminPaymentIntentRow = {
  id: string
  amount: number
  currency: string
  status: string
  customer: string | null
  email: string | null
  date: number
  description?: string | null
  invoice: {
    id: string
    hosted_invoice_url: string | null
    invoice_pdf: string | null
    number: string | null
  } | null
}

/** Period windows for `GET /admin/finance-dashboard?period=` (legacy `day|week|month|year` still accepted). */
export type FinanceDashboardPeriod =
  | 'this_week'
  | 'month_to_date'
  | 'last_month'
  | 'year_to_date'
  | 'last_year'
  | 'day'
  | 'week'
  | 'month'
  | 'year'

export type AdminFinanceDashboardResponse = {
  success: boolean
  period: FinanceDashboardPeriod
  rangeLabel: string
  windowStart: number
  windowEnd: number
  /** Lowercase ISO currency for formatting (from Stripe). */
  currency?: string
  recentPaidInvoices: Array<{
    id: string
    number: string | null
    amount_paid: number
    currency: string
    created: number
    customerId: string | null
    customerDisplayName: string
    subscriptionId: string | null
  }>
  recentSubscriptionChanges: Array<{
    id: string
    created: number
    subscriptionId: string
    customerId: string | null
    userDisplayName: string
    planName: string
    amountCents: number
    currency: string
    action: string
  }>
  /** Newest first; up to 10 rows in the selected period. */
  recentSubscriptions?: Array<{
    id: string
    created: number
    status: string
    subscriptionId: string
    customerId: string | null
    customerDisplayName: string
    planName: string
    amountCents: number
    currency: string
    currentPeriodEnd: number
  }>
  stats: {
    buckets: Array<{
      label: string
      start: number
      end: number
      revenueCents: number
      newSubscriptions: number
      cancellations: number
      upgrades: number
      downgrades: number
      cumulativeNetSubscriptions: number
    }>
    kpis: {
      activeSubscriptionsNow: number
      newInPeriod: number
      canceledInPeriod: number
      revenueInPeriodCents: number
      revenueAllTimeCents: number
      revenueAllTimeTruncated: boolean
      upgradesInPeriod: number
      downgradesInPeriod: number
      /** Paid `amount_paid` on invoices with `billing_reason` = `subscription_update` in the window (by paid time). */
      revenueInPeriodUpgradesCents?: number
      unpaidOpenInvoicesCount: number
      unpaidOpenInvoicesCents: number
    }
    byPlan: Array<{ productId: string; name: string; count: number }>
    /** Paid invoice revenue in the window, split by Stripe product (from line items). */
    revenueByPlan?: Array<{ productId: string; name: string; revenueCents: number }>
    truncated?: boolean
    upgradeDowngradeNote?: string
    rangeLabel?: string
  }
}

/** Response from Appwrite `stripe-api` `GET /admin/plans/catalog/:productId` (`getPlanDetailForAdmin`). */
export type AdminPlanDetailPayload = {
  plan: {
    id: string
    name: string
    description: string
    status: string
    monthlyPrice: number
    yearlyPrice: number
    monthlyPriceId: string | null
    yearlyPriceId: string | null
    currency: string
    metadata: Array<{ key: string; value: string }>
    allPrices: Array<{
      id: string
      amount: number
      currency: string
      interval: string
      interval_count: number
      /** From Stripe `Price.active` (admin list / deactivate). */
      active?: boolean
    }>
    stripeLink?: string
    images?: string[]
    catalogPlanType?: string
    catalogImageUrl?: string
    catalogCreated?: number
    catalogUpdated?: number
  }
  stats: {
    totalSubscriptions: number
    subscriptionsMonthly: number
    subscriptionsYearly: number
    totalEarnings: number
    upgradedTo: number
    downgradedTo: number
    downgradedFrom: number
  }
  subscribers: Array<{
    subscriptionId: string
    customerId: string
    email: string
    name: string
    billingInterval: string
    subscribedSince: number
    status: string
    userId: string | null
  }>
}

/** Stored in `platform_settings` key `team_billing` via `stripe-api` admin routes (default team plan prices). */
export type TeamBillingConfig = {
  teamProductId: string
  teamMonthlyPriceId: string
  teamYearlyPriceId: string
}

/** Stored in `platform_settings` key `personal_billing` — recurring Stripe price id for the $0 / entry tier (`price_…`). */
export type PersonalBillingConfig = {
  freePriceId: string
}

export type AdminTeamBillingGetPayload = {
  config: TeamBillingConfig
}

export type AdminTeamBillingSavePayload = {
  success: boolean
  config: TeamBillingConfig
}

export type AdminPaymentIntentDetail = {
  success: boolean
  paymentIntent: {
    id: string
    amount: number
    amount_received: number
    currency: string
    status: string
    created: number
    description: string | null
    receipt_email: string | null
    customer: { id: string; email: string | null; name: string | null } | null
    metadata: Record<string, string>
    last_payment_error: unknown
  }
  charge: {
    id: string
    amount: number
    currency: string
    status: string
    paid: boolean
    receipt_url: string | null
    failure_code: string | null
    failure_message: string | null
    billing_details: unknown
  } | null
}
