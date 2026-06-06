import { useDashboardNav } from '@/context/DashboardNavContext';
import {
  ADMIN_WORKSPACE_INBOX_QUERY_KEY,
  fetchAdminWorkspaceInboxEditorRows,
  type AdminInboxEditorRow,
} from '@/domains/admin/adminWorkspaceInboxQuery';
import { useAuth } from '@/domains/auth';
import { useQuery } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'wphub.adminInbox.selectedMailboxId';

export type AdminWorkspaceMailboxListItem = {
  id: string;
  label: string;
  /** When true, IMAP sync and manual “create ticket from message” are allowed for this mailbox. */
  is_ticket_inbox: boolean;
};

type AdminPlatformMailboxContextValue = {
  /** Admin nav mode + admin role: platform inbox list is loaded. */
  adminInboxMode: boolean;
  /** True once admin inbox query has settled (success or error). */
  adminInboxReady: boolean;
  /** List query still in flight (hide IMAP queries until resolved). */
  platformMailboxesLoading: boolean;
  platformMailboxes: AdminWorkspaceMailboxListItem[];
  selectedPlatformMailboxId: string | null;
  setSelectedPlatformMailboxId: (id: string | null) => void;
};

const AdminPlatformMailboxContext = createContext<AdminPlatformMailboxContextValue | null>(null);

export function AdminPlatformMailboxProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  const { mode } = useDashboardNav();
  const adminInboxMode = Boolean(isAdmin && mode === 'admin');

  const listQ = useQuery({
    queryKey: ADMIN_WORKSPACE_INBOX_QUERY_KEY,
    enabled: adminInboxMode,
    staleTime: 60_000,
    queryFn: fetchAdminWorkspaceInboxEditorRows,
    select: (rows: AdminInboxEditorRow[]) =>
      rows
        .map((r) => ({
          id: r.id,
          label: r.label,
          is_ticket_inbox: Boolean(r.is_ticket_inbox),
        }))
        .filter((m) => m.id),
  });

  const platformMailboxes = listQ.data ?? [];

  const [selectedPlatformMailboxId, setSelectedPlatformMailboxIdState] = useState<string | null>(() => {
    try {
      const s = sessionStorage.getItem(STORAGE_KEY);
      return s && s.trim() ? s.trim() : null;
    } catch {
      return null;
    }
  });

  const setSelectedPlatformMailboxId = useCallback((id: string | null) => {
    setSelectedPlatformMailboxIdState(id);
    try {
      if (id) sessionStorage.setItem(STORAGE_KEY, id);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!adminInboxMode || listQ.isPending) return;
    if (!platformMailboxes.length) return;
    const ok = selectedPlatformMailboxId && platformMailboxes.some((m) => m.id === selectedPlatformMailboxId);
    if (!ok) {
      setSelectedPlatformMailboxId(platformMailboxes[0].id);
    }
  }, [adminInboxMode, listQ.isPending, platformMailboxes, selectedPlatformMailboxId, setSelectedPlatformMailboxId]);

  const adminInboxReady = !adminInboxMode || (!listQ.isPending && (listQ.isSuccess || listQ.isError));

  const value = useMemo<AdminPlatformMailboxContextValue>(
    () => ({
      adminInboxMode,
      adminInboxReady,
      platformMailboxesLoading: adminInboxMode && listQ.isPending,
      platformMailboxes,
      selectedPlatformMailboxId,
      setSelectedPlatformMailboxId,
    }),
    [adminInboxMode, adminInboxReady, listQ.isPending, platformMailboxes, selectedPlatformMailboxId, setSelectedPlatformMailboxId],
  );

  return <AdminPlatformMailboxContext.Provider value={value}>{children}</AdminPlatformMailboxContext.Provider>;
}

export function useAdminPlatformMailbox(): AdminPlatformMailboxContextValue {
  const v = useContext(AdminPlatformMailboxContext);
  if (!v) {
    throw new Error('useAdminPlatformMailbox must be used within AdminPlatformMailboxProvider');
  }
  return v;
}
