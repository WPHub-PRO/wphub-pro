import { userHasAdminLabel } from '@/domains/auth/adminLabel';
import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { postAdminCustomerPlanLabels } from '@/lib/stripeAdminApi';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/** Raw user from Appwrite Users API */
export interface AppwriteUser {
  $id: string;
  name?: string;
  email?: string;
  status?: boolean;
  labels?: string[];
  prefs?: Record<string, unknown>;
  $createdAt?: string;
  $updatedAt?: string;
  [key: string]: unknown;
}

/** Account document from platform_db.accounts */
export interface AccountDoc {
  $id: string;
  user_id: string;
  current_plan_id?: string | null;
  stripe_customer_id?: string | null;
  avatar?: string | null;
  admin_notes?: string | null;
  [key: string]: unknown;
}

/** Formatted admin user for UI */
export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'User';
  isAdmin: boolean;
  planName: string;
  stripeId: string;
  status: 'Active' | 'Inactive';
  joined: string;
  prefs: Record<string, unknown>;
  /** Legacy URL from the `accounts` table (if any). */
  accountAvatar: string | null;
}

function formatUser(
  user: AppwriteUser,
  accountMap: Record<string, { stripeId: string | null; avatar: string | null }>,
  planLabels?: Record<string, string | null | undefined>,
): AdminUser {
  const labels = Array.isArray(user.labels) ? user.labels : [];
  const isAdmin = userHasAdminLabel(labels);
  const acc = accountMap[user.$id];
  const rawStripe = acc?.stripeId ? String(acc.stripeId).trim() : '';
  const hasStripeCustomer = rawStripe.startsWith('cus_');
  let planName = 'Free';
  if (hasStripeCustomer) {
    if (planLabels === undefined) {
      planName = 'Stripe';
    } else {
      const label = planLabels[rawStripe];
      planName = typeof label === 'string' && label.trim() ? label.trim() : 'No active subscription';
    }
  }
  const prefs = (user.prefs || {}) as Record<string, unknown>;
  const accountAvatar = acc?.avatar ?? (typeof prefs.avatar === 'string' ? prefs.avatar : null);
  return {
    id: user.$id,
    name: user.name || user.email || `aser ${(user.$id || '').substring(0, 8)}`,
    email: user.email || 'N/A',
    role: isAdmin ? 'Admin' : 'User',
    isAdmin,
    planName,
    stripeId: acc?.stripeId || 'n/a',
    status: user.status === false ? 'Inactive' : 'Active',
    joined: user.$createdAt ? new Date(user.$createdAt).toLocaleDateString() : 'n/a',
    prefs,
    accountAvatar,
  };
}

export type AdminUserStatusFilter = 'all' | 'active' | 'inactive';
export type AdminUserRoleFilter = 'all' | 'admin' | 'user';
export type AdminUserPlanFilter = 'all' | 'free' | 'stripe';

export interface ListUsersParams {
  limit?: number;
  offset?: number;
  search?: string;
  status?: AdminUserStatusFilter;
  role?: AdminUserRoleFilter;
  plan?: AdminUserPlanFilter;
  /** When true, skip Stripe plan-label batching (for typeahead / lightweight lists). */
  omitPlanLabels?: boolean;
}

export async function fetchFormattedAdminUsers(params: ListUsersParams): Promise<{
  users: AdminUser[];
  total: number;
  limit: number;
  offset: number;
}> {
  const limit = Math.max(1, Math.min(100, params.limit ?? 50));
  const offset = params.offset ?? 0;
  const search = params.search ?? '';
  const status = params.status ?? 'all';
  const role = params.role ?? 'all';
  const plan = params.plan ?? 'all';
  const omitPlanLabels = params.omitPlanLabels === true;

  const payload = { action: 'list', limit, offset, search, status, role, plan };

  const res = await executeFunction<{
    success?: boolean;
    users: Array<AppwriteUser & { account?: AccountDoc | null }>;
    total: number;
    limit?: number;
    offset?: number;
  }>(APPWRITE_FUNCTION_IDS.USERS, payload, { omitImpersonationHeaders: true });

  const rawUsers = res?.users ?? [];
  const total = res?.total ?? rawUsers.length;

  const accountMap: Record<string, { stripeId: string | null; avatar: string | null }> = {};
  rawUsers.forEach((row) => {
    const acc = row.account;
    accountMap[row.$id] = {
      stripeId: acc?.stripe_customer_id ?? null,
      avatar: acc?.avatar ?? null,
    };
  });

  const customerIds = [
    ...new Set(
      rawUsers
        .map((row) => {
          const acc = row.account;
          const id =
            acc && typeof acc.stripe_customer_id === 'string' ? acc.stripe_customer_id.trim() : '';
          return id.startsWith('cus_') ? id : null;
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  let planLabels: Record<string, string | null | undefined> | undefined;
  if (!omitPlanLabels && customerIds.length > 0) {
    try {
      const labelRes = await postAdminCustomerPlanLabels(customerIds);
      planLabels = labelRes?.labels ?? {};
    } catch {
      planLabels = undefined;
    }
  }

  const users = rawUsers.map((row) => formatUser(row as AppwriteUser, accountMap, planLabels));

  return { users, total, limit, offset };
}

export interface UpdateUserParams {
  userId: string;
  updates: {
    name?: string;
    email?: string;
    status?: 'Active' | 'Inactive';
    isAdmin?: boolean;
    stripe_customer_id?: string;
  };
}

export function useAdminUsersList(
  params: ListUsersParams = {},
  options?: { enabled?: boolean },
) {
  const limit = Math.max(1, Math.min(100, params.limit ?? 50));
  const offset = params.offset ?? 0;
  const search = params.search ?? '';
  const status = params.status ?? 'all';
  const role = params.role ?? 'all';
  const plan = params.plan ?? 'all';

  return useQuery({
    queryKey: ['admin', 'users', limit, offset, search, status, role, plan],
    queryFn: () => fetchFormattedAdminUsers({ limit, offset, search, status, role, plan }),
    enabled: options?.enabled ?? true,
  });
}

export function useAdminUserRecipientSearch(
  debouncedSearch: string,
  options?: { enabled?: boolean; minSearchLength?: number },
) {
  const q = debouncedSearch.trim();
  const minLen = options?.minSearchLength ?? 2;
  return useQuery({
    queryKey: ['admin', 'user-recipient-search', q, minLen],
    queryFn: () =>
      fetchFormattedAdminUsers({
        limit: 15,
        offset: 0,
        search: q,
        status: 'all',
        role: 'all',
        plan: 'all',
        omitPlanLabels: true,
      }),
    enabled: (options?.enabled ?? true) && q.length >= minLen,
    staleTime: 30_000,
  });
}

export function useAdminUsersUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, updates }: UpdateUserParams) => {
      const userUpdates: Record<string, unknown> = {};
      if (updates.name !== undefined) userUpdates.name = updates.name;
      if (updates.email !== undefined) userUpdates.email = updates.email;
      if (updates.status !== undefined) userUpdates.status = updates.status;
      if (updates.isAdmin !== undefined) userUpdates.isAdmin = updates.isAdmin;
      if (updates.stripe_customer_id !== undefined)
        userUpdates.stripe_customer_id = updates.stripe_customer_id;

      await executeFunction(
        APPWRITE_FUNCTION_IDS.USERS,
        {
          action: 'update',
          userId,
          updates: userUpdates,
        },
        { omitImpersonationHeaders: true },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

