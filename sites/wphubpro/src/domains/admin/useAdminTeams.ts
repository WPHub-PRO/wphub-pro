import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { fetchAdminCustomerSubscriptions } from '@/lib/stripeAdminApi';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type AdminTeamListRow = {
  teamId: string;
  teamName: string;
  ownerId: string;
  maxSeats: number | null;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  $createdAt?: string;
  /** Appwrite team memberships count (admin list). */
  memberCount?: number;
};

export type AdminTeamDetailPayload = {
  success?: boolean;
  teamId: string;
  teamName: string;
  memberCount: number;
  row: AdminTeamListRow | null;
};

async function fetchAdminTeamsList(limit: number, offset: number, search?: string) {
  const payload: Record<string, unknown> = {
    action: 'admin-teams-list',
    limit,
    offset,
  };
  const s = typeof search === 'string' ? search.trim() : '';
  if (s) payload.search = s;

  const res = await executeFunction<{
    success?: boolean;
    rows?: AdminTeamListRow[];
    total?: number;
  }>(APPWRITE_FUNCTION_IDS.USERS, payload, { omitImpersonationHeaders: true });
  return { rows: res?.rows ?? [], total: res?.total ?? 0 };
}

async function fetchAdminTeamGet(teamId: string) {
  return executeFunction<AdminTeamDetailPayload>(
    APPWRITE_FUNCTION_IDS.USERS,
    { action: 'admin-team-get', teamId },
    { omitImpersonationHeaders: true },
  );
}

export function useAdminTeamsList(limit: number, offset: number, search?: string) {
  const s = search?.trim() ?? '';
  return useQuery({
    queryKey: ['admin-teams-list', limit, offset, s],
    queryFn: () => fetchAdminTeamsList(limit, offset, s || undefined),
  });
}

export function useAdminTeamRecipientSearch(debouncedSearch: string, options?: { enabled?: boolean }) {
  const q = debouncedSearch.trim();
  return useQuery({
    queryKey: ['admin', 'team-recipient-search', q],
    queryFn: () => fetchAdminTeamsList(15, 0, q),
    enabled: (options?.enabled ?? true) && q.length >= 1,
    staleTime: 30_000,
  });
}

export function useAdminTeamDetail(teamId: string | undefined) {
  return useQuery({
    queryKey: ['admin-team-detail', teamId],
    enabled: Boolean(teamId?.trim()),
    queryFn: () => fetchAdminTeamGet(teamId!.trim()),
  });
}

/** Stripe subscriptions for the team’s Stripe customer (admin `stripe-api`; requires platform admin). */
export function useAdminCustomerSubscriptions(stripeCustomerId: string | undefined | null) {
  const id = typeof stripeCustomerId === 'string' ? stripeCustomerId.trim() : '';
  return useQuery({
    queryKey: ['admin', 'stripe-customer-subscriptions', id],
    enabled: Boolean(id.startsWith('cus_')),
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetchAdminCustomerSubscriptions(id);
      return res.subscriptions ?? [];
    },
  });
}

export function useAdminTeamPatchMaxSeats() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { teamId: string; maxSeats: number }) => {
      return executeFunction<{ success?: boolean }>(
        APPWRITE_FUNCTION_IDS.USERS,
        {
          action: 'admin-team-patch',
          teamId: vars.teamId.trim(),
          maxSeats: vars.maxSeats,
        },
        { omitImpersonationHeaders: true },
      );
    },
    onSuccess: (_data: unknown, vars: { teamId: string; maxSeats: number }) => {
      void qc.invalidateQueries({ queryKey: ['admin-teams-list'] });
      void qc.invalidateQueries({ queryKey: ['admin-team-detail', vars.teamId] });
    },
  });
}
