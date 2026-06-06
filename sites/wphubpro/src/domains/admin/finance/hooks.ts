import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffectiveIsAdmin } from '@/context/useEffectiveIsAdmin'
import type { AdminPlanDetailPayload } from './types'
import {
  fetchAdminCatalogPlanDetail,
  fetchAdminCatalogPlans,
  fetchAdminPersonalBilling,
  fetchAdminTeamBilling,
  postAdminPersonalBilling,
  postAdminTeamBilling,
  fetchAdminFinanceDashboard,
  fetchAdminInvoice,
  postAdminInvoiceSendReminder,
  fetchAdminInvoicesRecent,
  fetchAdminPaymentIntentDetail,
  fetchAdminPaymentIntents,
  fetchAdminSubscription,
  fetchAdminSubscriptionRows,
  postAdminCreatePriceMajor,
  postAdminCreateProduct,
  postAdminPlanCatalogMetadata,
  postAdminPriceActive,
  postAdminProductActive,
  postAdminSubscriptionCancel,
  postAdminSubscriptionChangePrice,
  postAdminSubscriptionPause,
  postAdminSubscriptionResume,
} from '@/lib/stripeAdminApi'
import type { StripePlan } from '@/types'
import type {
  AdminFinanceDashboardResponse,
  AdminPaymentIntentDetail,
  AdminPaymentIntentRow,
  AdminSubscriptionRow,
  FinanceDashboardPeriod,
  PersonalBillingConfig,
  TeamBillingConfig,
} from './types'

export function useFinanceAdminEnabled() {
  return useEffectiveIsAdmin()
}

export function useFinanceDashboard(period: FinanceDashboardPeriod) {
  const enabled = useFinanceAdminEnabled()
  return useQuery<AdminFinanceDashboardResponse, Error>({
    queryKey: ['admin', 'finance', 'dashboard', period],
    queryFn: async () => {
      const res = await fetchAdminFinanceDashboard(period)
      if (!res?.success) {
        const msg = (res as { error?: string } | null)?.error
        throw new Error(msg || 'Dashboard failed')
      }
      if (!res.stats) {
        throw new Error(
          'Dashboard response missing stats (implement `GET /admin/finance-dashboard` in `stripe-api` or fix the response).',
        )
      }
      return res
    },
    enabled,
    staleTime: 60_000,
  })
}

export type AdminSubscriptionListParams = {
  status?: string
  priceId?: string
  productId?: string
  search?: string
  sortField?: string
  sortDir?: 'asc' | 'desc'
  maxPages?: number
}

export type UseAdminSubscriptionListOptions = {
  /** When false, the list request is not started (e.g. wait until another query finishes). */
  enabled?: boolean
}

export function useAdminSubscriptionList(
  params: AdminSubscriptionListParams,
  options?: UseAdminSubscriptionListOptions,
) {
  const adminEnabled = useFinanceAdminEnabled()
  const startAllowed = options?.enabled !== false
  return useQuery<{ subscriptions: AdminSubscriptionRow[]; fetchedPages: number }, Error>({
    queryKey: ['admin', 'finance', 'subscriptions', params],
    queryFn: () => fetchAdminSubscriptionRows(params),
    enabled: adminEnabled && startAllowed,
    staleTime: 30_000,
  })
}

export type AdminSubscriptionDetailFromApi = Awaited<ReturnType<typeof fetchAdminSubscription>>

/**
 * Admin subscription detail via Appwrite `stripe-api` (`GET /admin/subscriptions/:id`).
 */
export function useAdminSubscriptionDetails(subscriptionId: string | undefined) {
  const enabled = useFinanceAdminEnabled() && Boolean(subscriptionId)
  return useQuery<AdminSubscriptionDetailFromApi, Error>({
    queryKey: ['admin', 'finance', 'subscription', 'api', subscriptionId],
    queryFn: async () => fetchAdminSubscription(subscriptionId!),
    enabled,
    staleTime: 30_000,
  })
}

export type AdminStripePlansListData = {
  plans: StripePlan[]
  subscriptionCountsTruncated: boolean
}

export type UseAdminStripePlansListOptions = {
  /** When false, the plans request is not started (e.g. wait until another query finishes). */
  enabled?: boolean
}

/**
 * Admin plan list via Appwrite `stripe-api` (`GET /admin/plans/catalog`).
 */
export function useAdminStripePlansList(options?: UseAdminStripePlansListOptions) {
  const adminEnabled = useFinanceAdminEnabled()
  const startAllowed = options?.enabled !== false
  return useQuery<AdminStripePlansListData, Error>({
    queryKey: ['admin', 'finance', 'plans', 'api', 'catalog'],
    queryFn: async () => fetchAdminCatalogPlans(),
    enabled: adminEnabled && startAllowed,
    staleTime: 120_000,
  })
}

export function useAdminTeamBillingConfig() {
  const adminEnabled = useFinanceAdminEnabled()
  return useQuery<{ config: TeamBillingConfig }, Error>({
    queryKey: ['admin', 'finance', 'plans', 'team-billing'],
    queryFn: async () => fetchAdminTeamBilling(),
    enabled: adminEnabled,
    staleTime: 30_000,
  })
}

export function useAdminTeamBillingSave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { config: TeamBillingConfig }) => {
      return postAdminTeamBilling(input)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'finance', 'plans', 'team-billing'] })
    },
  })
}

export function useAdminPersonalBillingConfig() {
  const adminEnabled = useFinanceAdminEnabled()
  return useQuery<{ config: PersonalBillingConfig }, Error>({
    queryKey: ['admin', 'finance', 'plans', 'personal-billing'],
    queryFn: async () => fetchAdminPersonalBilling(),
    enabled: adminEnabled,
    staleTime: 30_000,
  })
}

export function useAdminPersonalBillingSave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { config: PersonalBillingConfig }) => {
      return postAdminPersonalBilling(input)
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'finance', 'plans', 'personal-billing'] })
    },
  })
}

/**
 * Plan detail via Appwrite `stripe-api` (`GET /admin/plans/catalog/:productId`).
 */
export function useAdminPlanDetail(productId: string | undefined) {
  const enabled = useFinanceAdminEnabled() && Boolean(productId)
  return useQuery<AdminPlanDetailPayload, Error>({
    queryKey: ['admin', 'finance', 'plan', 'api', 'catalog', productId],
    queryFn: async () => fetchAdminCatalogPlanDetail(productId!),
    enabled,
    staleTime: 60_000,
  })
}

function invalidatePlanDetailQueries(qc: ReturnType<typeof useQueryClient>, productId?: string) {
  void qc.invalidateQueries({ queryKey: ['admin', 'finance', 'plans'] })
  if (productId) {
    void qc.invalidateQueries({
      queryKey: ['admin', 'finance', 'plan', 'api', 'catalog', productId],
    })
  } else {
    void qc.invalidateQueries({ queryKey: ['admin', 'finance', 'plan'] })
  }
}

export type AdminPaymentsListParams = {
  limit?: number
  customer?: string
  status?: string
}

export function useAdminPaymentsList(params: AdminPaymentsListParams) {
  const enabled = useFinanceAdminEnabled()
  return useQuery<{ orders: AdminPaymentIntentRow[] }, Error>({
    queryKey: ['admin', 'finance', 'payments', params],
    queryFn: () => fetchAdminPaymentIntents(params),
    enabled,
    staleTime: 30_000,
  })
}

export type AdminRecentInvoicesParams = {
  limit?: number
}

/** Account-wide recent invoices via Appwrite `stripe-api` (`GET /admin/invoices/recent`). */
export function useAdminRecentInvoicesList(params: AdminRecentInvoicesParams = {}) {
  const enabled = useFinanceAdminEnabled()
  const limit = Math.min(Math.max(params.limit ?? 25, 1), 100)
  return useQuery<{ invoices: Record<string, unknown>[] }, Error>({
    queryKey: ['admin', 'finance', 'invoices-recent', limit],
    queryFn: () => fetchAdminInvoicesRecent(limit),
    enabled,
    staleTime: 30_000,
  })
}

/** Single invoice by id — Appwrite `stripe-api` (`GET /admin/billing/invoices/:invoiceId`). */
export function useAdminStripeInvoice(invoiceId: string | undefined) {
  const enabled = useFinanceAdminEnabled() && Boolean(invoiceId)
  return useQuery<{ invoice: Record<string, unknown> }, Error>({
    queryKey: ['admin', 'finance', 'invoice', invoiceId],
    queryFn: () => fetchAdminInvoice(invoiceId!),
    enabled,
    staleTime: 60_000,
  })
}

export function useAdminInvoiceSendReminder() {
  const qc = useQueryClient()
  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (invId: string) => postAdminInvoiceSendReminder(invId),
    onSuccess: async (_d, invId) => {
      await qc.invalidateQueries({ queryKey: ['admin', 'finance', 'invoice', invId] })
    },
  })
}

export function useAdminPaymentDetail(paymentIntentId: string | undefined) {
  const enabled = useFinanceAdminEnabled() && Boolean(paymentIntentId)
  return useQuery<AdminPaymentIntentDetail, Error>({
    queryKey: ['admin', 'finance', 'payment', paymentIntentId],
    queryFn: () => fetchAdminPaymentIntentDetail(paymentIntentId!),
    enabled,
    staleTime: 60_000,
  })
}

export function useAdminUpdatePlan() {
  const qc = useQueryClient()
  return useMutation<
    { success: boolean },
    Error,
    {
      productId: string
      name?: string
      description?: string
      sites_limit?: number | string | null
      library_limit?: number | string | null
      storage_limit?: number | string | null
      non_sellable?: boolean
      hidden?: boolean
      type?: string
      seats_included?: number | string | null
      plan_features?: string
      images?: string[]
    }
  >({
    mutationFn: async (body) => {
      await postAdminPlanCatalogMetadata(body)
      return { success: true }
    },
    onSuccess: (_d, vars) => {
      invalidatePlanDetailQueries(qc, vars.productId)
    },
  })
}

export type AdminCreatePlanInput = {
  name: string
  description?: string
  planFeatures?: string
  imageUrl?: string
  planType: 'personal plan' | 'team plan'
  sites_limit?: string
  library_limit?: string
  storage_limit?: string
  seats_included?: string
  monthlyAmount?: number
  yearlyAmount?: number
  currency?: string
  hidden?: boolean
  non_sellable?: boolean
}

/** `stripe-api` returns the Stripe product object at the top level; some callers wrap as `{ product }`. */
function productIdFromStripeCreateResponse(res: unknown): string {
  if (!res || typeof res !== 'object') return ''
  const o = res as Record<string, unknown>
  if (typeof o.id === 'string' && o.id.trim()) return o.id.trim()
  const inner = o.product
  if (inner && typeof inner === 'object') {
    const id = (inner as Record<string, unknown>).id
    if (typeof id === 'string' && id.trim()) return id.trim()
  }
  return ''
}

export function useAdminCreatePlan() {
  const qc = useQueryClient()
  return useMutation<{ productId: string }, Error, AdminCreatePlanInput>({
    mutationFn: async (input) => {
      const meta: Record<string, string> = {
        type: input.planType,
        hidden: input.hidden ? 'true' : 'false',
        non_sellable: input.non_sellable ? 'true' : 'false',
      }
      if (input.sites_limit?.trim()) meta.sites_limit = input.sites_limit.trim()
      if (input.library_limit?.trim()) meta.library_limit = input.library_limit.trim()
      if (input.storage_limit?.trim()) meta.storage_limit = input.storage_limit.trim()
      if (input.planFeatures?.trim()) meta.plan_features = input.planFeatures.trim().slice(0, 500)
      if (input.planType === 'team plan' && input.seats_included?.trim()) {
        meta.seats_included = input.seats_included.trim()
      }

      const res = await postAdminCreateProduct({
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
        images: input.imageUrl?.trim() ? [input.imageUrl.trim()] : undefined,
        metadata: meta,
      })
      const productId = productIdFromStripeCreateResponse(res)
      if (!productId) throw new Error('Stripe did not return a product id')

      const currency = (input.currency ?? 'eur').toLowerCase()
      if (input.monthlyAmount != null && input.monthlyAmount > 0) {
        await postAdminCreatePriceMajor({
          productId,
          amount: input.monthlyAmount,
          interval: 'month',
          currency,
        })
      }
      if (input.yearlyAmount != null && input.yearlyAmount > 0) {
        await postAdminCreatePriceMajor({
          productId,
          amount: input.yearlyAmount,
          interval: 'year',
          currency,
        })
      }

      return { productId }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['admin', 'finance', 'plans'] })
    },
  })
}

export function useAdminSetPlanActive() {
  const qc = useQueryClient()
  return useMutation<{ success: boolean }, Error, { productId: string; active: boolean }>({
    mutationFn: async ({ productId, active }) => {
      await postAdminProductActive({ productId, active })
      return { success: true }
    },
    onSuccess: (_d, vars) => {
      invalidatePlanDetailQueries(qc, vars.productId)
    },
  })
}

export function useAdminSetPriceActive() {
  const qc = useQueryClient()
  return useMutation<{ success: boolean }, Error, { priceId: string; active: boolean; productId?: string }>({
    mutationFn: async ({ priceId, active }) => {
      await postAdminPriceActive({ priceId, active })
      return { success: true }
    },
    onSuccess: (_d, vars) => {
      invalidatePlanDetailQueries(qc, vars.productId)
    },
  })
}

export function useAdminCreatePrice() {
  const qc = useQueryClient()
  return useMutation<
    { success: boolean; priceId?: string },
    Error,
    { productId: string; amount: number; interval: 'month' | 'year'; currency?: string }
  >({
    mutationFn: async (body) => {
      const res = await postAdminCreatePriceMajor(body)
      const id = res.price && typeof res.price === 'object' && 'id' in res.price ? String(res.price.id) : undefined
      return { success: true, priceId: id }
    },
    onSuccess: (_d, vars) => {
      invalidatePlanDetailQueries(qc, vars.productId)
    },
  })
}

export function useAdminCancelSubscription() {
  const qc = useQueryClient()
  return useMutation<{ success: boolean }, Error, { subscriptionId: string; immediate?: boolean }>({
    mutationFn: async ({ subscriptionId, immediate }) => {
      await postAdminSubscriptionCancel(subscriptionId, { immediate: Boolean(immediate) })
      return { success: true }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'finance'] })
    },
  })
}

export function useAdminPauseSubscription() {
  const qc = useQueryClient()
  return useMutation<{ success: boolean }, Error, { subscriptionId: string; behavior?: 'void' | 'mark_uncollectible' }>(
    {
      mutationFn: async ({ subscriptionId, behavior }) => {
        await postAdminSubscriptionPause(subscriptionId, { behavior: behavior ?? 'mark_uncollectible' })
        return { success: true }
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['admin', 'finance'] })
      },
    },
  )
}

export function useAdminResumeSubscription() {
  const qc = useQueryClient()
  return useMutation<{ success: boolean }, Error, { subscriptionId: string }>({
    mutationFn: async ({ subscriptionId }) => {
      await postAdminSubscriptionResume(subscriptionId)
      return { success: true }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'finance'] })
    },
  })
}

export function useAdminArchiveSubscription() {
  const qc = useQueryClient()
  return useMutation<
    { success: boolean },
    Error,
    { subscriptionId: string; cancelAtPeriodEnd?: boolean; immediate?: boolean }
  >({
    mutationFn: async (body) => {
      await postAdminSubscriptionCancel(body.subscriptionId, { immediate: body.immediate === true })
      return { success: true }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'finance'] })
    },
  })
}

export function useAdminUpdateSubscriptionPrice() {
  const qc = useQueryClient()
  return useMutation<
    { success: boolean },
    Error,
    {
      subscriptionId: string
      newPriceId: string
      proration_behavior?: 'always_invoice' | 'none'
      sameProductOnly?: boolean
    }
  >({
    mutationFn: async (body) => {
      await postAdminSubscriptionChangePrice(body.subscriptionId, {
        newPriceId: body.newPriceId,
        proration_behavior: body.proration_behavior,
        sameProductOnly: body.sameProductOnly ?? true,
      })
      return { success: true }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'finance'] })
    },
  })
}
