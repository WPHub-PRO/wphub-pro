import { COLLECTIONS, DATABASE_ID, databases } from '@/services/appwrite';
import { useQuery } from '@tanstack/react-query';
import { Query } from 'appwrite';

/**
 * `platform_db.accounts` — one document per Auth user (`user_id`). Personal billing fields
 * (e.g. `stripe_customer_id`, `active_team_id`) live here; Auth prefs may mirror
 * `stripe_customer_id` for legacy checks. There is no separate platform `users` collection for billing.
 */
export type MyAccountDoc = {
  $id: string;
  user_id: string;
  current_plan_id?: string | null;
  stripe_customer_id?: string | null;
  active_team_id?: string | null;
};

function normalizeAccountDoc(raw: unknown): MyAccountDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const active =
    (typeof d.active_team_id === 'string' && d.active_team_id) ||
    (typeof d.activeTeamId === 'string' && d.activeTeamId) ||
    null;
  const trimmed = active?.trim() || null;
  return {
    ...(d as unknown as MyAccountDoc),
    active_team_id: trimmed,
  };
}

export function useMyAccountDoc(userId: string | undefined) {
  return useQuery({
    queryKey: ['my-account-doc', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.ACCOUNTS, [
        Query.equal('user_id', userId!),
      ]);
      const doc = res.documents[0];
      return normalizeAccountDoc(doc);
    },
  });
}
