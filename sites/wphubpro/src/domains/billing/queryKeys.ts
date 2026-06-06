export const billingSubscriptionQueryKey = (
  userId: string,
  entityType: 'user' | 'team',
  teamId: string | null | undefined,
) => ['billing-subscription', userId, entityType, teamId ?? ''] as const;

export const billingInvoicesQueryKey = (
  userId: string,
  entityType: 'user' | 'team',
  teamId: string | null | undefined,
) => ['billing-invoices', userId, entityType, teamId ?? ''] as const;
