import { useEffectiveIsAdmin } from '@/context/useEffectiveIsAdmin';
import { useAdminTeamsList } from '@/domains/admin/useAdminTeams';
import { useAdminUsersList } from '@/domains/admin/useAdminUsers';
import { useSitesForLibraryInstall } from '@/domains/sites';
import { useAdminTickets } from '@/domains/tickets';
import { useAdminStats } from '@/hooks/useAdminStats';
import type { Site } from '@/types';
import { useMemo } from 'react';
import { computeAdminTicketStats } from './ticketStats';

export function useAdminDashboardPlatformStats() {
  const enabled = useEffectiveIsAdmin();
  const usersQ = useAdminUsersList({ limit: 1, offset: 0, status: 'all' }, { enabled });
  const teamsQ = useAdminTeamsList(1, 0, undefined);
  const sitesQ = useSitesForLibraryInstall();

  const siteMetrics = useMemo(() => summarizeSites(sitesQ.data), [sitesQ.data]);

  return {
    usersTotal: usersQ.data?.total,
    teamsTotal: teamsQ.data?.total,
    sitesTotal: siteMetrics.total,
    connectedSites: siteMetrics.connected,
    sitesCapped: siteMetrics.capped,
    isLoading: usersQ.isLoading || teamsQ.isLoading || sitesQ.isLoading,
    isError: usersQ.isError || teamsQ.isError || sitesQ.isError,
  };
}

function summarizeSites(sites: Site[] | undefined): { total: number; connected: number; capped: boolean } {
  const list = sites ?? [];
  const enabled = list.filter((s) => s.enabled !== false);
  const connected = enabled.filter((s) => s.status === 'connected').length;
  return {
    total: enabled.length,
    connected,
    capped: list.length >= 200,
  };
}

export function useAdminDashboardTicketStats(currentUserId: string | undefined) {
  const q = useAdminTickets();
  const stats = useMemo(
    () => computeAdminTicketStats(q.data?.tickets ?? [], currentUserId),
    [q.data?.tickets, currentUserId],
  );
  return { ...q, stats };
}

export function useAdminDashboardFinancialSummary() {
  const enabled = useEffectiveIsAdmin();
  const statsQ = useAdminStats();
  const mrrCents = statsQ.data?.mrrCents;
  const activeSubs = statsQ.data?.activeSubscriptionCount;
  const currency = (statsQ.data?.currency ?? 'eur').toLowerCase();

  return {
    mrrCents,
    activeSubs,
    currency,
    isLoading: statsQ.isLoading,
    isError: statsQ.isError,
    error: statsQ.error,
    enabled,
  };
}
