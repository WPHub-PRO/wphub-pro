import type { MailboxConnection } from '@/domains/mailbox/mailboxApi';
import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

export type AdminInboxApiMailbox = {
  id?: string;
  label?: string;
  is_ticket_inbox?: boolean;
  connection?: MailboxConnection;
  has_imap_password?: boolean;
  has_smtp_password?: boolean;
};

export type AdminInboxEditorRow = {
  id: string;
  label: string;
  is_ticket_inbox: boolean;
  connection: MailboxConnection;
  imap_password: string;
  smtp_password: string;
  has_imap_password: boolean;
  has_smtp_password: boolean;
};

export const ADMIN_WORKSPACE_INBOX_QUERY_KEY = ['admin', 'workspace-inbox-mailboxes'] as const;

function emptyConnection(): MailboxConnection {
  return {
    imap_host: '',
    imap_port: 993,
    imap_tls: true,
    imap_user: '',
    smtp_host: '',
    smtp_port: 587,
    smtp_tls: true,
    smtp_user: '',
    from_email: '',
    from_name: '',
  };
}

/** Merge API / partial objects into a full connection (safe for UI bindings). */
export function ensureMailboxConnection(raw: unknown): MailboxConnection {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyConnection();
  }
  return { ...emptyConnection(), ...(raw as Partial<MailboxConnection>) };
}

export function mapApiMailboxesToEditorRows(list: AdminInboxApiMailbox[]): AdminInboxEditorRow[] {
  return list.map((m) => ({
    id: String(m.id || '').trim(),
    label: String(m.label || '').trim() || String(m.id || '').trim(),
    is_ticket_inbox: Boolean(m.is_ticket_inbox),
    connection: ensureMailboxConnection(m.connection),
    imap_password: '',
    smtp_password: '',
    has_imap_password: Boolean(m.has_imap_password),
    has_smtp_password: Boolean(m.has_smtp_password),
  }));
}

export async function fetchAdminWorkspaceInboxEditorRows(): Promise<AdminInboxEditorRow[]> {
  const res = await executeFunction<{ success?: boolean; mailboxes?: AdminInboxApiMailbox[] }>(
    APPWRITE_FUNCTION_IDS.PLATFORM_SETTINGS,
    { action: 'get_admin_workspace_inbox' },
    { omitImpersonationHeaders: true },
  );
  return mapApiMailboxesToEditorRows(Array.isArray(res.mailboxes) ? res.mailboxes : []);
}
