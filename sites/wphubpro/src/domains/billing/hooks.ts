import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Query } from 'appwrite';
import { useNotificationContext } from '@/context/useNotificationContext';
import type {
  PreparePayInvoiceResponse,
  StripeCustomerTaxIdRow,
  StripeInlinePaymentPayload,
  StripeInvoice,
  StripePaymentMethod,
  StripePlan,
  StripeProrationPreviewResponse,
  Subscription,
  SubscriptionDetailsCustomerAddress,
  SubscriptionDetailsResponse,
} from '@/types';
import { useAuth } from '@/domains/auth';
import { postStripeJsonAuthed } from '@/lib/stripe-loader';
import { COLLECTIONS, DATABASE_ID, databases } from '@/services/appwrite';

/** Pass from profile after `useMyAccountDoc` resolves to avoid duplicate account reads and unnecessary Stripe calls. */
export type BillingStripeEntityType = 'user' | 'team';

export type BillingAccountContext = {
  accountReady: boolean;
  /** Stripe `customer` id for this billing context (personal account or team row). */
  stripeCustomerId: string;
  /** Default `user` (personal). Use `team` with `teamId` for the team's Stripe customer. */
  entityType?: BillingStripeEntityType;
  /** Appwrite team `$id` when `entityType === 'team'`. */
  teamId?: string | null;
};

/** Merge `entityType` / `teamId` into `POST /user-billing` JSON for dual Stripe customers. */
export function withBillingEntity(
  ctx: BillingAccountContext | undefined,
  body: Record<string, unknown>,
): Record<string, unknown> {
  const entityType = ctx?.entityType ?? 'user';
  if (entityType === 'team' && ctx?.teamId?.trim()) {
    return { ...body, entityType: 'team', teamId: ctx.teamId.trim() };
  }
  return { ...body, entityType: 'user' };
}

function useBillingNotify() {
  const { showNotification } = useNotificationContext();
  return {
    error: (title: string, message: string) =>
      showNotification({ title, message, variant: 'danger', delay: 4000 }),
    success: (title: string, message: string) =>
      showNotification({ title, message, variant: 'success', delay: 3000 }),
  };
}

function stripeBillingEnabled(userId: string | undefined, ctx: BillingAccountContext | undefined) {
  if (!userId) return false;
  if (!ctx) return true;
  if (ctx.entityType === 'team') {
    return Boolean(ctx.teamId?.trim() && ctx.stripeCustomerId.trim().startsWith('cus_'));
  }
  return ctx.accountReady && Boolean(ctx.stripeCustomerId.trim());
}

/** `list-plans` does not require a Stripe customer; enable once account context is ready (or team tab). */
function stripePlansQueryEnabled(userId: string | undefined, ctx: BillingAccountContext | undefined) {
  if (!userId) return false;
  if (!ctx) return true;
  if (ctx.entityType === 'team') return true;
  return Boolean(ctx.accountReady);
}

export type CheckoutSessionResult = {
  sessionId?: string;
  url?: string | null;
  subscriptionId?: string | null;
  status?: string;
  message?: string;
  payment?: StripeInlinePaymentPayload | null;
};

export const useInvoices = (ctx?: BillingAccountContext) => {
  const { user } = useAuth();
  return useQuery<StripeInvoice[], Error>({
    queryKey: ['invoices', user?.$id, ctx?.stripeCustomerId, ctx?.entityType, ctx?.teamId],
    queryFn: async () => {
      if (!user) return [];
      const result = await postStripeJsonAuthed<{ invoices: StripeInvoice[] }>(
        '/user-billing',
        withBillingEntity(ctx, { action: 'list-invoices' }),
      );
      return result?.invoices ?? [];
    },
    enabled: stripeBillingEnabled(user?.$id, ctx),
    staleTime: 1000 * 60 * 2,
  });
};

export type UseStripePlansOptions = {
  /** When true, include hidden and non-sellable products (e.g. admin default-signup picker). */
  listAllProducts?: boolean;
};

export const useStripePlans = (ctx?: BillingAccountContext, options?: UseStripePlansOptions) => {
  const { user } = useAuth();
  const listAll = Boolean(options?.listAllProducts);
  return useQuery<StripePlan[], Error>({
    queryKey: ['stripePlans', user?.$id, ctx?.stripeCustomerId, ctx?.entityType, ctx?.teamId, listAll],
    queryFn: async () => {
      const response = await postStripeJsonAuthed<{ plans: StripePlan[] }>(
        '/user-billing',
        withBillingEntity(ctx, {
          action: 'list-plans',
          exclude_hidden: !listAll,
          exclude_non_sellable: !listAll,
        }),
      );
      return response.plans || [];
    },
    enabled: stripePlansQueryEnabled(user?.$id, ctx),
    staleTime: 1000 * 60 * 60,
  });
};

export const useCreateCheckoutSession = (ctx?: BillingAccountContext) => {
  const queryClient = useQueryClient();
  const notify = useBillingNotify();
  return useMutation<
    CheckoutSessionResult,
    Error,
    {
      priceId: string;
      returnUrl?: string;
      updateType?: 'upgrade' | 'downgrade';
      /** Attached card to use when the customer has no default payment method */
      paymentMethodId?: string;
    }
  >({
    mutationFn: async ({ priceId, returnUrl, updateType, paymentMethodId }) => {
      const baseUrl = returnUrl ?? window.location.origin;
      const result = await postStripeJsonAuthed<CheckoutSessionResult>(
        '/user-billing',
        withBillingEntity(ctx, {
          action: 'create-checkout-session',
          priceId,
          returnUrl: baseUrl,
          updateType,
          ...(paymentMethodId ? { paymentMethodId } : {}),
        }),
      );
      return result ?? {};
    },
    onSuccess: (data) => {
      if (data?.payment?.clientSecret) {
        return;
      }
      if (data?.url) {
        return;
      }
      if (data?.subscriptionId) {
        queryClient.invalidateQueries({ queryKey: ['subscription'] });
        queryClient.invalidateQueries({ queryKey: ['subscriptionDetails'] });
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        notify.success('Plan updated', data.message ?? 'Your plan has been updated.');
      }
    },
    onError: (error) => {
      notify.error('Error', `Could not start checkout: ${error.message}`);
    },
  });
};

export type CancelSubscriptionResult = {
  success: boolean;
  message?: string;
  cancelAt?: number;
};

export const useCancelSubscription = (ctx?: BillingAccountContext) => {
  const queryClient = useQueryClient();
  const notify = useBillingNotify();
  return useMutation<CancelSubscriptionResult, Error, void>({
    mutationFn: async () => {
      return await postStripeJsonAuthed<CancelSubscriptionResult>(
        '/user-billing',
        withBillingEntity(ctx, { action: 'cancel-subscription' }),
      );
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptionDetails'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      const endMsg = data.cancelAt
        ? `You keep access until ${new Date(data.cancelAt * 1000).toLocaleDateString('nl-NL', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}.`
        : (data.message ?? 'Your subscription will end at the end of the billing period.');
      notify.success('Subscription cancelled', endMsg);
    },
    onError: (error) => {
      notify.error('Error', `Could not cancel subscription: ${error.message}`);
    },
  });
};

export const useSubscription = (ctx?: BillingAccountContext) => {
  const { user } = useAuth();
  return useQuery<Subscription | null, Error>({
    queryKey: [
      'subscription',
      user?.$id,
      ctx?.stripeCustomerId ?? 'self-fetch',
      ctx?.entityType,
      ctx?.teamId,
    ],
    queryFn: async () => {
      if (!user?.$id) return null;

      let stripeCustomerId: string | null = null;
      if (ctx) {
        stripeCustomerId = ctx.stripeCustomerId.trim() || null;
      } else {
        try {
          const accountDocs = await databases.listDocuments(DATABASE_ID, COLLECTIONS.ACCOUNTS, [
            Query.equal('user_id', user.$id),
            Query.limit(1),
          ]);
          if (accountDocs.documents.length > 0) {
            const raw = (accountDocs.documents[0] as { stripe_customer_id?: string | null }).stripe_customer_id;
            stripeCustomerId = raw?.trim() || null;
          }
        } catch (e) {
          console.error('Failed to fetch accounts:', e);
        }
      }

      if (!stripeCustomerId) return null;

      try {
        const responseBody = await postStripeJsonAuthed<Record<string, unknown>>(
          '/user-billing',
          withBillingEntity(ctx, { action: 'get-subscription' }),
        );
        if (responseBody && responseBody['status'] !== 'canceled') {
          const b = responseBody as Record<string, unknown>;
          return {
            ...responseBody,
            userId: user.$id,
            source: 'stripe',
            cancelAtPeriodEnd:
              (b.cancelAtPeriodEnd as boolean | undefined) ??
              (b.cancel_at_period_end as boolean | undefined),
            currentPeriodEnd:
              (b.currentPeriodEnd as number | undefined) ??
              (b.current_period_end as number | undefined),
          } as Subscription;
        }
      } catch (e) {
        console.error('Failed to fetch Stripe subscription:', e);
      }

      return null;
    },
    enabled:
      !!user?.$id &&
      (ctx ? stripeBillingEnabled(user?.$id, ctx) : true),
    staleTime: 1000 * 60 * 5,
  });
};

export type StripeCustomerBilling = {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  address: SubscriptionDetailsCustomerAddress | null;
};

export const useStripeCustomerProfile = (
  ctx?: BillingAccountContext,
  options?: { enabled?: boolean }
) => {
  const { user } = useAuth();
  const enabled =
    (options?.enabled ?? true) && stripeBillingEnabled(user?.$id, ctx);
  return useQuery<StripeCustomerBilling | null, Error>({
    queryKey: ['stripeCustomerProfile', user?.$id, ctx?.stripeCustomerId, ctx?.entityType, ctx?.teamId],
    queryFn: async () => {
      const result = await postStripeJsonAuthed<{ success?: boolean; customer?: StripeCustomerBilling }>(
        '/user-billing',
        withBillingEntity(ctx, { action: 'get-customer' }),
      );
      return result?.customer ?? null;
    },
    enabled,
    staleTime: 1000 * 60 * 2,
  });
};

export type PaymentMethodsData = {
  paymentMethods: StripePaymentMethod[];
  /** Stripe customer `invoice_settings.default_payment_method` */
  defaultPaymentMethodId: string | null;
};

export const usePaymentMethods = (ctx?: BillingAccountContext) => {
  const { user } = useAuth();
  return useQuery<PaymentMethodsData, Error>({
    queryKey: ['paymentMethods', user?.$id, ctx?.stripeCustomerId, ctx?.entityType, ctx?.teamId],
    queryFn: async () => {
      if (!user) {
        return { paymentMethods: [], defaultPaymentMethodId: null };
      }
      const result = await postStripeJsonAuthed<{
        paymentMethods: StripePaymentMethod[];
        defaultPaymentMethodId?: string | null;
      }>('/user-billing', withBillingEntity(ctx, { action: 'list-payment-methods' }));
      return {
        paymentMethods: result?.paymentMethods ?? [],
        defaultPaymentMethodId: result?.defaultPaymentMethodId ?? null,
      };
    },
    enabled: stripeBillingEnabled(user?.$id, ctx),
    staleTime: 1000 * 60 * 2,
  });
};

export const useCreateSetupIntent = (ctx?: BillingAccountContext) => {
  const queryClient = useQueryClient();
  const notify = useBillingNotify();
  return useMutation<{ clientSecret: string }, Error, void>({
    mutationFn: async () => {
      const result = await postStripeJsonAuthed<{ clientSecret: string }>(
        '/user-billing',
        withBillingEntity(ctx, { action: 'create-setup-intent' }),
      );
      if (!result?.clientSecret) throw new Error('No client secret returned');
      return { clientSecret: result.clientSecret };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentMethods'] });
    },
    onError: (error) => {
      notify.error('Error', error.message || 'Could not start add card.');
    },
  });
};

export const useAttachPaymentMethod = (ctx?: BillingAccountContext) => {
  const queryClient = useQueryClient();
  const notify = useBillingNotify();
  return useMutation<void, Error, { paymentMethodId: string; setAsDefault?: boolean }>({
    mutationFn: async ({ paymentMethodId, setAsDefault }) => {
      await postStripeJsonAuthed(
        '/user-billing',
        withBillingEntity(ctx, {
          action: 'attach-payment-method',
          paymentMethodId,
          setAsDefault: setAsDefault ?? true,
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentMethods'] });
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptionDetails'] });
      notify.success('Card added', 'Payment method saved.');
    },
    onError: (error) => {
      notify.error('Error', error.message || 'Could not add card.');
    },
  });
};

export const useDetachPaymentMethod = (ctx?: BillingAccountContext) => {
  const queryClient = useQueryClient();
  const notify = useBillingNotify();
  return useMutation<void, Error, string>({
    mutationFn: async (paymentMethodId) => {
      await postStripeJsonAuthed(
        '/user-billing',
        withBillingEntity(ctx, { action: 'detach-payment-method', paymentMethodId }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentMethods'] });
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptionDetails'] });
      notify.success('Card removed', 'Payment method removed.');
    },
    onError: (error) => {
      notify.error('Error', error.message || 'Could not remove card.');
    },
  });
};

export const useSetDefaultPaymentMethod = (ctx?: BillingAccountContext) => {
  const queryClient = useQueryClient();
  const notify = useBillingNotify();
  return useMutation<void, Error, string>({
    mutationFn: async (paymentMethodId) => {
      await postStripeJsonAuthed(
        '/user-billing',
        withBillingEntity(ctx, { action: 'set-default-payment-method', paymentMethodId }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['paymentMethods'] });
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptionDetails'] });
      notify.success('Default updated', 'Default payment method updated.');
    },
    onError: (error) => {
      notify.error('Error', error.message || 'Could not set default.');
    },
  });
};

export const useSubscriptionDetails = (
  subscriptionId: string | null | undefined,
  ctx?: BillingAccountContext
) => {
  const { user } = useAuth();
  return useQuery<SubscriptionDetailsResponse, Error>({
    queryKey: ['subscriptionDetails', user?.$id, subscriptionId, ctx?.stripeCustomerId, ctx?.entityType, ctx?.teamId],
    queryFn: async () => {
      if (!subscriptionId) throw new Error('No subscription ID');
      return await postStripeJsonAuthed<SubscriptionDetailsResponse>(
        '/user-billing',
        withBillingEntity(ctx, {
          action: 'get-subscription-details',
          subscriptionId,
        }),
      );
    },
    enabled: Boolean(user && subscriptionId && stripeBillingEnabled(user.$id, ctx)),
    staleTime: 1000 * 60 * 2,
  });
};

export const usePreviewProration = (ctx?: BillingAccountContext) => {
  const notify = useBillingNotify();
  return useMutation<
    StripeProrationPreviewResponse,
    Error,
    { subscriptionId: string; newPriceId: string }
  >({
    mutationFn: async ({ subscriptionId, newPriceId }) => {
      return await postStripeJsonAuthed<StripeProrationPreviewResponse>(
        '/user-billing',
        withBillingEntity(ctx, {
          action: 'preview-proration',
          subscriptionId,
          newPriceId,
        }),
      );
    },
    onError: (error) => {
      notify.error('Preview', error.message || 'Could not load proration estimate.');
    },
  });
};

export const usePreparePayInvoice = (ctx?: BillingAccountContext) => {
  const queryClient = useQueryClient();
  const notify = useBillingNotify();
  return useMutation<PreparePayInvoiceResponse, Error, { invoiceId: string }>({
    mutationFn: async ({ invoiceId }) => {
      return await postStripeJsonAuthed<PreparePayInvoiceResponse>(
        '/user-billing',
        withBillingEntity(ctx, {
          action: 'prepare-pay-invoice',
          invoiceId,
        }),
      );
    },
    onSuccess: (data) => {
      if (data.paid) {
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        queryClient.invalidateQueries({ queryKey: ['subscription'] });
        queryClient.invalidateQueries({ queryKey: ['subscriptionDetails'] });
        notify.success('Invoice paid', 'Payment completed.');
      }
    },
    onError: (error) => {
      notify.error('Invoice', error.message || 'Could not prepare payment.');
    },
  });
};

export type UpdateBillingDetailsPayload = {
  name?: string;
  email?: string;
  phone?: string;
  address?: SubscriptionDetailsCustomerAddress | null;
};

export const useUpdateBillingDetails = (ctx?: BillingAccountContext) => {
  const queryClient = useQueryClient();
  const notify = useBillingNotify();
  return useMutation<void, Error, UpdateBillingDetailsPayload>({
    mutationFn: async (body) => {
      await postStripeJsonAuthed('/user-billing', withBillingEntity(ctx, { action: 'update-customer', ...body }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptionDetails'] });
      queryClient.invalidateQueries({ queryKey: ['stripeCustomerProfile'] });
      queryClient.invalidateQueries({ queryKey: ['customerTaxIds'] });
      notify.success('Billing details', 'Your billing information was updated.');
    },
    onError: (error) => {
      notify.error('Billing details', error.message || 'Could not save.');
    },
  });
};

export type EnsureStripeCustomerResult = {
  success: boolean;
  skipped?: boolean;
  stripeCustomerId?: string;
  message?: string;
};

export const useEnsureStripeCustomer = () => {
  const queryClient = useQueryClient();
  const notify = useBillingNotify();
  const { user } = useAuth();
  return useMutation<EnsureStripeCustomerResult, Error, void>({
    mutationFn: async () => {
      return await postStripeJsonAuthed<EnsureStripeCustomerResult>('/user-billing', {
        action: 'ensure-customer',
      });
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['my-account-doc', user?.$id] });
      notify.success(
        'Billing ready',
        data.skipped ? 'Your billing profile was already set up.' : (data.message ?? 'Stripe customer created.'),
      );
    },
    onError: (error) => {
      notify.error('Billing setup', error.message || 'Could not set up billing.');
    },
  });
};

export const useCancelScheduledPlanChange = (ctx?: BillingAccountContext) => {
  const queryClient = useQueryClient();
  const notify = useBillingNotify();
  return useMutation<
    { success: boolean; scheduleId?: string },
    Error,
    { scheduleId?: string; subscriptionId?: string }
  >({
    mutationFn: async (payload) => {
      return await postStripeJsonAuthed<{ success: boolean; scheduleId?: string }>(
        '/user-billing',
        withBillingEntity(ctx, {
          action: 'cancel-schedule-update',
          ...payload,
        }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptionDetails'] });
      notify.success('Plan change', 'Scheduled downgrade was cancelled.');
    },
    onError: (error) => {
      notify.error('Plan change', error.message || 'Could not cancel scheduled change.');
    },
  });
};

export const useCustomerTaxIds = (ctx?: BillingAccountContext) => {
  const { user } = useAuth();
  return useQuery<StripeCustomerTaxIdRow[], Error>({
    queryKey: ['customerTaxIds', user?.$id, ctx?.stripeCustomerId, ctx?.entityType, ctx?.teamId],
    queryFn: async () => {
      const result = await postStripeJsonAuthed<{ success?: boolean; taxIds?: StripeCustomerTaxIdRow[] }>(
        '/user-billing',
        withBillingEntity(ctx, { action: 'list-tax-ids' }),
      );
      return result?.taxIds ?? [];
    },
    enabled: stripeBillingEnabled(user?.$id, ctx),
    staleTime: 1000 * 60 * 2,
  });
};

export const useAddCustomerTaxId = (ctx?: BillingAccountContext) => {
  const queryClient = useQueryClient();
  const notify = useBillingNotify();
  return useMutation<void, Error, { type: string; value: string }>({
    mutationFn: async ({ type, value }) => {
      await postStripeJsonAuthed('/user-billing', withBillingEntity(ctx, { action: 'add-tax-id', type, value }));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customerTaxIds'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptionDetails'] });
      notify.success('Tax ID', 'Tax identifier added to this Stripe customer.');
    },
    onError: (error) => {
      notify.error('Tax ID', error.message || 'Could not add tax identifier.');
    },
  });
};

export const useDeleteCustomerTaxId = (ctx?: BillingAccountContext) => {
  const queryClient = useQueryClient();
  const notify = useBillingNotify();
  return useMutation<void, Error, string>({
    mutationFn: async (taxId) => {
      await postStripeJsonAuthed(
        '/user-billing',
        withBillingEntity(ctx, { action: 'delete-tax-id', taxId }),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customerTaxIds'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptionDetails'] });
      notify.success('Tax ID', 'Tax identifier removed.');
    },
    onError: (error) => {
      notify.error('Tax ID', error.message || 'Could not remove tax identifier.');
    },
  });
};
