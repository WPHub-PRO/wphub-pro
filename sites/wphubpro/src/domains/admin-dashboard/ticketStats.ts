import type { Ticket } from '@/types';

const ACTIVE_STATUSES = new Set(['open', 'in_progress', 'waiting']);

export type AdminTicketTabId = 'overview' | 'longest';

export type AdminTicketStats = {
  newCount: number;
  waitingReplyCount: number;
  assignedToMeCount: number;
  activeCount: number;
  longestWaiting: Ticket[];
};

function ticketAgeMs(ticket: Ticket, nowMs: number): number {
  const raw = ticket.$updatedAt || ticket.$createdAt;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, nowMs - t);
}

export function computeAdminTicketStats(tickets: Ticket[], currentUserId: string | undefined): AdminTicketStats {
  const uid = currentUserId?.trim() ?? '';
  const active = tickets.filter((t) => ACTIVE_STATUSES.has(t.status));
  const newCount = tickets.filter((t) => t.status === 'open').length;
  const waitingReplyCount = tickets.filter((t) => t.status === 'waiting').length;
  const assignedToMeCount = uid
    ? active.filter((t) => (t.assignedToUserId ?? '').trim() === uid).length
    : 0;

  const nowMs = Date.now();
  const longestWaiting = [...active]
    .sort((a, b) => ticketAgeMs(b, nowMs) - ticketAgeMs(a, nowMs))
    .slice(0, 5);

  return {
    newCount,
    waitingReplyCount,
    assignedToMeCount,
    activeCount: active.length,
    longestWaiting,
  };
}

export function formatTicketAge(iso: string | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d`;
  return new Date(t).toLocaleDateString();
}
