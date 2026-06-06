import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

export type MailboxWorkspace = 'personal' | 'team' | 'platform_admin';

export type MailboxWorkspaceParts = {
  workspace: MailboxWorkspace;
  teamId: string | null;
  platformMailboxId: string | null;
};

export function mailboxRouteKey(parts: MailboxWorkspaceParts): string {
  if (parts.workspace === 'platform_admin') return `padmin:${parts.platformMailboxId || 'none'}`;
  if (parts.workspace === 'team') return `team:${parts.teamId || ''}`;
  return 'personal';
}

/** Fields expected by user-mailbox (`team_id`, `platform_mailbox_id` snake_case). */
export function mailboxWorkspacePayload(
  workspace: MailboxWorkspace,
  teamId: string | null,
  platformMailboxId: string | null = null,
): Record<string, unknown> {
  return {
    workspace,
    team_id: teamId ?? '',
    platform_mailbox_id: platformMailboxId ?? '',
  };
}

export type MailboxConnection = {
  imap_host: string;
  imap_port: number;
  imap_tls: boolean;
  imap_user: string;
  smtp_host: string;
  smtp_port: number;
  smtp_tls: boolean;
  smtp_user: string;
  from_email: string;
  from_name: string;
};

export type GetSettingsResponse = {
  success?: boolean;
  workspace?: MailboxWorkspace;
  team_id?: string | null;
  configured?: boolean;
  connection?: MailboxConnection;
  has_imap_password?: boolean;
  has_smtp_password?: boolean;
  message?: string;
};

export type ListMessagesResponse = {
  success?: boolean;
  folder?: string;
  messages?: Array<{
    uid: string;
    subject: string;
    from_name: string;
    from_address: string;
    date: string | null;
    seen: boolean;
    /** Set when the IMAP server includes `\Flagged` in list payloads (optional). */
    flagged?: boolean;
    snippet?: string;
  }>;
  /** 1-based page (newest mail on page 1). */
  page?: number;
  page_size?: number;
  total_messages?: number;
  total_pages?: number;
  message?: string;
};

export type FetchRawResponse = {
  success?: boolean;
  subject?: string;
  textPlain?: string;
  textHtml?: string;
  from?: string;
  date?: string | null;
  seen?: boolean;
  flagged?: boolean;
  message_id?: string;
  references?: string;
  message?: string;
};

export type MessageActionOp =
  | 'delete'
  | 'archive'
  | 'snooze'
  | 'move'
  | 'mark_read'
  | 'mark_unread'
  | 'flag'
  | 'unflag'
  | 'tag_add'
  | 'tag_remove';

export type MessageActionResponse = {
  success?: boolean;
  message?: string;
};

export type MailboxFolderRow = {
  path: string;
  name?: string;
  special?: string | null;
};

export type ListMailboxesResponse = {
  success?: boolean;
  mailboxes?: MailboxFolderRow[];
  message?: string;
};

type MailboxPayload = Record<string, unknown>;

type MailboxExecuteOpts = {
  /** IMAP list/fetch can exceed Appwrite sync cap. */
  longRunning?: boolean;
};

export async function mailboxExecute<T>(payload: MailboxPayload, opts: MailboxExecuteOpts = {}): Promise<T> {
  const { longRunning = false } = opts;
  return executeFunction<T>(APPWRITE_FUNCTION_IDS.USER_MAILBOX, payload, {
    longRunning,
    maxAsyncWaitMs: longRunning ? 110_000 : 60_000,
  });
}

export type SyncTicketInboxResponse = {
  success?: boolean;
  folder?: string;
  examined?: number;
  imported_count?: number;
  imported?: Array<{
    uid: number;
    ticket_id?: string;
    reporter_user_id?: string | null;
    guest_from_email?: string | null;
  }>;
  skipped?: unknown[];
  errors?: Array<{ uid: number; error: string }>;
  message?: string;
};

const emptySyncTicketInboxResponse = (): SyncTicketInboxResponse => ({
  success: false,
  imported_count: 0,
  examined: 0,
  message:
    'No JSON in function response (Appwrite async executions often omit responseBody until you inspect logs).',
});

export type CreateTicketFromMessageResponse = {
  success?: boolean;
  ticket_id?: string;
  reporter_user_id?: string | null;
  guest_from_email?: string | null;
  message?: string;
};

export async function createTicketFromMailboxMessage(
  workspaceParts: MailboxWorkspaceParts,
  folder: string,
  uid: number,
): Promise<CreateTicketFromMessageResponse> {
  return mailboxExecute<CreateTicketFromMessageResponse>({
    action: 'create_ticket_from_message',
    ...mailboxWorkspacePayload(workspaceParts.workspace, workspaceParts.teamId, workspaceParts.platformMailboxId),
    folder,
    uid,
  });
}

export async function syncTicketMailboxInbox(platformMailboxId: string, folder = 'INBOX'): Promise<SyncTicketInboxResponse> {
  const raw = await mailboxExecute<SyncTicketInboxResponse | null>(
    {
      action: 'sync_ticket_inbox',
      ...mailboxWorkspacePayload('platform_admin', null, platformMailboxId),
      folder,
      max_messages: 25,
    },
    { longRunning: true },
  );
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptySyncTicketInboxResponse();
  }
  return {
    ...raw,
    imported_count: raw.imported_count ?? 0,
    examined: raw.examined ?? 0,
  };
}
