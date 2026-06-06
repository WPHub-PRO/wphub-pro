import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { postStripeJsonAuthed } from '@/lib/stripe-loader';

export type TeamCheckoutBillingAddress = {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postal_code: string;
  country: string;
};

type CreateTeamCheckoutResponse = { url?: string; sessionId?: string };

type ListTeamInvoicesResponse = {
  invoices?: Array<{
    id: string;
    number?: string;
    status?: string;
    amount_paid?: number;
    currency?: string;
    hosted_invoice_url?: string;
  }>;
};

export function useCreateTeamCheckoutMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      teamName: string;
      billingCompanyName: string;
      billingAddress: TeamCheckoutBillingAddress;
      vatNumber?: string;
      interval: 'month' | 'year';
      priceId?: string | null;
    }) => {
      const returnUrl = `${window.location.origin}/teams`;
      const vat = vars.vatNumber?.trim();
      return postStripeJsonAuthed<CreateTeamCheckoutResponse>('/user-billing', {
        action: 'create-team-checkout-session',
        teamName: vars.teamName.trim(),
        billingCompanyName: vars.billingCompanyName.trim(),
        billingAddress: {
          line1: vars.billingAddress.line1.trim(),
          ...(vars.billingAddress.line2?.trim()
            ? { line2: vars.billingAddress.line2.trim() }
            : {}),
          city: vars.billingAddress.city.trim(),
          ...(vars.billingAddress.state?.trim()
            ? { state: vars.billingAddress.state.trim() }
            : {}),
          postal_code: vars.billingAddress.postal_code.trim(),
          country: vars.billingAddress.country.trim().toUpperCase(),
        },
        ...(vat ? { vatNumber: vat.replace(/\s+/g, '').toUpperCase() } : {}),
        interval: vars.interval,
        returnUrl,
        ...(vars.priceId?.trim() ? { priceId: vars.priceId.trim() } : {}),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team', 'workspace'] });
      void qc.invalidateQueries({ queryKey: ['team', 'list'] });
    },
  });
}

export function useFinalizeTeamCheckoutMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      return postStripeJsonAuthed<{ success?: boolean; teamId?: string }>('/user-billing', {
        action: 'finalize-team-checkout',
        sessionId: sessionId.trim(),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['team', 'workspace'] });
      void qc.invalidateQueries({ queryKey: ['team', 'list'] });
      void qc.invalidateQueries({ queryKey: ['my-account-doc'] });
    },
  });
}

export function useTeamInvoices(stripeCustomerId: string | null | undefined) {
  return useQuery({
    queryKey: ['team', 'invoices', stripeCustomerId],
    enabled: Boolean(stripeCustomerId && stripeCustomerId.startsWith('cus_')),
    queryFn: async () => {
      const res = await postStripeJsonAuthed<ListTeamInvoicesResponse>('/user-billing', {
        action: 'list-team-invoices',
        stripeCustomerId,
      });
      return res.invoices ?? [];
    },
  });
}
