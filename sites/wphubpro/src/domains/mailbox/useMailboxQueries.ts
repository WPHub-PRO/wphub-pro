import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAdminPlatformMailbox } from '@/context/AdminPlatformMailboxContext';
import { useDashboardNav } from '@/context/DashboardNavContext';
import { useWorkspaceContext } from '@/domains/workspace/useWorkspaceContext';
import {
  createTicketFromMailboxMessage,
  mailboxExecute,
  mailboxRouteKey,
  mailboxWorkspacePayload,
  type FetchRawResponse,
  type GetSettingsResponse,
  type ListMailboxesResponse,
  type ListMessagesResponse,
  type MailboxWorkspaceParts,
  type MessageActionResponse,
  type MessageActionOp,
} from '@/domains/mailbox/mailboxApi';

export type MailboxWorkspaceContextParts = MailboxWorkspaceParts & {
  routeKey: string;
  /** False while admin platform mailbox list is loading or mailbox id not ready. */
  mailboxQueriesEnabled: boolean;
};

const qk = {
  settings: (p: MailboxWorkspaceContextParts) => ['mailbox-settings', p.workspace, p.routeKey] as const,
  folders: (p: MailboxWorkspaceContextParts) => ['mailbox-folders', p.workspace, p.routeKey] as const,
  messages: (p: MailboxWorkspaceContextParts, folder: string, page: number, pageSize: number) =>
    ['mailbox-messages', p.workspace, p.routeKey, folder, page, pageSize] as const,
  message: (p: MailboxWorkspaceContextParts, folder: string, uid: string) =>
    ['mailbox-message', p.workspace, p.routeKey, folder, uid] as const,
};

export function useMailboxWorkspaceParts(): MailboxWorkspaceContextParts {
  const { mode, activeTeamId } = useWorkspaceContext();
  const { mode: dashMode } = useDashboardNav();
  const adminMb = useAdminPlatformMailbox();

  if (dashMode === 'admin' && adminMb.adminInboxMode) {
    if (adminMb.platformMailboxesLoading) {
      const base: MailboxWorkspaceParts = { workspace: 'platform_admin', teamId: null, platformMailboxId: null };
      return { ...base, routeKey: 'padmin:loading', mailboxQueriesEnabled: false };
    }
    if (adminMb.platformMailboxes.length > 0) {
      if (adminMb.selectedPlatformMailboxId) {
        const base: MailboxWorkspaceParts = {
          workspace: 'platform_admin',
          teamId: null,
          platformMailboxId: adminMb.selectedPlatformMailboxId,
        };
        return { ...base, routeKey: mailboxRouteKey(base), mailboxQueriesEnabled: true };
      }
      /** Avoid one-frame fallthrough to `personal` before `useEffect` picks the first mailbox (spurious user-mailbox 400). */
      const base: MailboxWorkspaceParts = {
        workspace: 'platform_admin',
        teamId: null,
        platformMailboxId: null,
      };
      return { ...base, routeKey: 'padmin:pending-select', mailboxQueriesEnabled: false };
    }
  }

  if (mode === 'team' && activeTeamId) {
    const base: MailboxWorkspaceParts = { workspace: 'team', teamId: activeTeamId, platformMailboxId: null };
    return { ...base, routeKey: mailboxRouteKey(base), mailboxQueriesEnabled: true };
  }

  const base: MailboxWorkspaceParts = { workspace: 'personal', teamId: null, platformMailboxId: null };
  return { ...base, routeKey: mailboxRouteKey(base), mailboxQueriesEnabled: true };
}

const PERSONAL_MAILBOX_CONTEXT: MailboxWorkspaceContextParts = {
  workspace: 'personal',
  teamId: null,
  platformMailboxId: null,
  routeKey: 'personal',
  mailboxQueriesEnabled: true,
};

function teamMailboxContextParts(teamId: string): MailboxWorkspaceContextParts {
  const base: MailboxWorkspaceParts = { workspace: 'team', teamId, platformMailboxId: null };
  return { ...base, routeKey: mailboxRouteKey(base), mailboxQueriesEnabled: true };
}

export function useMailboxSettingsQuery() {
  const parts = useMailboxWorkspaceParts();
  return useQuery({
    queryKey: qk.settings(parts),
    enabled: parts.mailboxQueriesEnabled,
    queryFn: () =>
      mailboxExecute<GetSettingsResponse>({
        action: 'get_settings',
        ...mailboxWorkspacePayload(parts.workspace, parts.teamId, parts.platformMailboxId),
      }),
  });
}

export const DEFAULT_MAIL_PAGE_SIZE = 10;

export function useMailboxFoldersQuery() {
  const parts = useMailboxWorkspaceParts();
  return useQuery({
    queryKey: qk.folders(parts),
    enabled: parts.mailboxQueriesEnabled,
    queryFn: async () => {
      /** Stay synchronous: Appwrite async executions often omit `responseBody` when polling (see executeFunction). */
      const data = await mailboxExecute<ListMailboxesResponse>({
        action: 'list_mailboxes',
        ...mailboxWorkspacePayload(parts.workspace, parts.teamId, parts.platformMailboxId),
      });
      if (data == null || typeof data !== 'object') {
        throw new Error('Mailbox returned an empty response. Redeploy user-mailbox or retry.');
      }
      return data;
    },
  });
}

export function useMailboxMessagesQuery(folder: string, page: number, pageSize: number = DEFAULT_MAIL_PAGE_SIZE) {
  const parts = useMailboxWorkspaceParts();
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize) || DEFAULT_MAIL_PAGE_SIZE));
  return useQuery({
    queryKey: qk.messages(parts, folder, safePage, safeSize),
    queryFn: async () => {
      /** Synchronous execution so `responseBody` is present (async poll often drops it on Appwrite Cloud). */
      const data = await mailboxExecute<ListMessagesResponse>(
        {
          action: 'list_messages',
          folder,
          page: safePage,
          page_size: safeSize,
          ...mailboxWorkspacePayload(parts.workspace, parts.teamId, parts.platformMailboxId),
        },
      );
      if (data == null || typeof data !== 'object') {
        throw new Error('Mailbox returned an empty message list. Retry or check user-mailbox logs.');
      }
      return data;
    },
    enabled: parts.mailboxQueriesEnabled && Boolean(folder),
  });
}

export function useMailboxMessageQuery(folder: string, uid: string | undefined) {
  const parts = useMailboxWorkspaceParts();
  return useQuery({
    queryKey: qk.message(parts, folder, uid || ''),
    queryFn: async () => {
      const data = await mailboxExecute<FetchRawResponse>(
        {
          action: 'fetch_raw',
          folder,
          uid: Number(uid),
          ...mailboxWorkspacePayload(parts.workspace, parts.teamId, parts.platformMailboxId),
        },
      );
      if (data == null || typeof data !== 'object') {
        throw new Error('Mailbox returned an empty message. Retry or check user-mailbox logs.');
      }
      return data;
    },
    enabled: parts.mailboxQueriesEnabled && Boolean(uid && folder),
  });
}

export function useMailboxSaveSettingsMutation() {
  const qc = useQueryClient();
  const parts = useMailboxWorkspaceParts();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mailboxExecute<{ success?: boolean; message?: string }>({
        action: 'save_settings',
        ...mailboxWorkspacePayload(parts.workspace, parts.teamId, parts.platformMailboxId),
        ...body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.settings(parts) });
      qc.invalidateQueries({ queryKey: qk.folders(parts) });
    },
  });
}

export function useMailboxTestImapMutation() {
  const parts = useMailboxWorkspaceParts();
  return useMutation({
    mutationFn: () =>
      mailboxExecute<{ success?: boolean; message?: string }>({
        action: 'test_imap',
        ...mailboxWorkspacePayload(parts.workspace, parts.teamId, parts.platformMailboxId),
      }),
  });
}

export function useMailboxTestSmtpMutation() {
  const parts = useMailboxWorkspaceParts();
  return useMutation({
    mutationFn: () =>
      mailboxExecute<{ success?: boolean; message?: string }>({
        action: 'test_smtp',
        ...mailboxWorkspacePayload(parts.workspace, parts.teamId, parts.platformMailboxId),
      }),
  });
}

export function useMailboxSendMutation() {
  const qc = useQueryClient();
  const parts = useMailboxWorkspaceParts();
  return useMutation({
    mutationFn: (body: {
      to: string;
      subject: string;
      text?: string;
      html?: string;
      in_reply_to?: string;
      references?: string;
    }) =>
      mailboxExecute<{ success?: boolean; message?: string; messageId?: string | null }>({
        action: 'send_message',
        ...mailboxWorkspacePayload(parts.workspace, parts.teamId, parts.platformMailboxId),
        ...body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mailbox-messages', parts.workspace, parts.routeKey] });
    },
  });
}

export type MailboxMessageActionBody = {
  op: MessageActionOp;
  folder: string;
  uid: number;
  target_folder?: string;
  tag?: string;
};

export function useMailboxMessageActionMutation() {
  const qc = useQueryClient();
  const parts = useMailboxWorkspaceParts();
  return useMutation({
    mutationFn: (body: MailboxMessageActionBody) =>
      mailboxExecute<MessageActionResponse>({
        action: 'message_action',
        ...mailboxWorkspacePayload(parts.workspace, parts.teamId, parts.platformMailboxId),
        op: body.op,
        folder: body.folder,
        uid: body.uid,
        target_folder: body.target_folder,
        tag: body.tag,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mailbox-messages', parts.workspace, parts.routeKey] });
      qc.invalidateQueries({ queryKey: ['mailbox-message', parts.workspace, parts.routeKey] });
    },
  });
}

function mailboxPartsPayload(p: MailboxWorkspaceContextParts): MailboxWorkspaceParts {
  return {
    workspace: p.workspace,
    teamId: p.teamId,
    platformMailboxId: p.platformMailboxId,
  };
}

export function useMailboxCreateTicketFromMessageMutation() {
  const qc = useQueryClient();
  const parts = useMailboxWorkspaceParts();
  return useMutation({
    mutationFn: (body: { folder: string; uid: number }) =>
      createTicketFromMailboxMessage(mailboxPartsPayload(parts), body.folder, body.uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] });
      qc.invalidateQueries({ queryKey: ['adminTickets'] });
      qc.invalidateQueries({ queryKey: ['mailbox-message', parts.workspace, parts.routeKey] });
      qc.invalidateQueries({ queryKey: ['mailbox-messages', parts.workspace, parts.routeKey] });
    },
  });
}

const qkPersonal = ['mailbox-personal-settings'] as const;

export function usePersonalMailboxSettingsQuery() {
  return useQuery({
    queryKey: qkPersonal,
    queryFn: () =>
      mailboxExecute<GetSettingsResponse>({
        action: 'get_settings',
        ...mailboxWorkspacePayload('personal', null),
      }),
  });
}

export function usePersonalMailboxSaveMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mailboxExecute<{ success?: boolean; message?: string }>({
        action: 'save_settings',
        ...mailboxWorkspacePayload('personal', null),
        ...body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qkPersonal });
      qc.invalidateQueries({ queryKey: qk.folders(PERSONAL_MAILBOX_CONTEXT) });
    },
  });
}

export function usePersonalMailboxTestImapMutation() {
  return useMutation({
    mutationFn: () =>
      mailboxExecute<{ success?: boolean; message?: string }>({
        action: 'test_imap',
        ...mailboxWorkspacePayload('personal', null),
      }),
  });
}

export function usePersonalMailboxTestSmtpMutation() {
  return useMutation({
    mutationFn: () =>
      mailboxExecute<{ success?: boolean; message?: string }>({
        action: 'test_smtp',
        ...mailboxWorkspacePayload('personal', null),
      }),
  });
}

export function useTeamMailboxSettingsQuery(teamId: string | undefined) {
  const tid = teamId?.trim() ?? '';
  return useQuery({
    queryKey: ['mailbox-team-settings', tid],
    enabled: Boolean(tid),
    queryFn: () =>
      mailboxExecute<GetSettingsResponse>({
        action: 'get_settings',
        ...mailboxWorkspacePayload('team', tid),
      }),
  });
}

export function useTeamMailboxSaveMutation(teamId: string | undefined) {
  const qc = useQueryClient();
  const tid = teamId?.trim() ?? '';
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      mailboxExecute<{ success?: boolean; message?: string }>({
        action: 'save_settings',
        ...mailboxWorkspacePayload('team', tid),
        ...body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mailbox-team-settings', tid] });
      qc.invalidateQueries({ queryKey: qk.folders(teamMailboxContextParts(tid)) });
    },
  });
}

export function useTeamMailboxTestImapMutation(teamId: string | undefined) {
  const tid = teamId?.trim() ?? '';
  return useMutation({
    mutationFn: () =>
      mailboxExecute<{ success?: boolean; message?: string }>({
        action: 'test_imap',
        ...mailboxWorkspacePayload('team', tid),
      }),
  });
}

export function useTeamMailboxTestSmtpMutation(teamId: string | undefined) {
  const tid = teamId?.trim() ?? '';
  return useMutation({
    mutationFn: () =>
      mailboxExecute<{ success?: boolean; message?: string }>({
        action: 'test_smtp',
        ...mailboxWorkspacePayload('team', tid),
      }),
  });
}
