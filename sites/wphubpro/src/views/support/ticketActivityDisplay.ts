import { formatPriority, formatTicketStatus } from './supportUi';

type PatchRow = {
  status?: string;
  priority?: string;
  assigned_to_user_id?: string | null;
};

function asPatchRow(v: unknown): PatchRow | null {
  if (!v || typeof v !== 'object') return null;
  return v as PatchRow;
}

/**
 * Turns ticket activity `detail_json` (e.g. `{ before, after }` patches) into short sentences.
 * Returns `null` when the payload should be shown as-is (non-patch JSON or parse failure).
 */
export function formatTicketActivityDetailLines(detailJson: string | null | undefined): string[] | null {
  const raw = detailJson?.trim();
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const root = parsed as Record<string, unknown>;
  const before = asPatchRow(root.before);
  const after = asPatchRow(root.after);
  if (!before || !after) return null;

  const lines: string[] = [];

  if (before.status !== undefined && after.status !== undefined && before.status !== after.status) {
    lines.push(
      `Status changed from ${formatTicketStatus(String(before.status))} to ${formatTicketStatus(String(after.status))}`,
    );
  }

  if (before.priority !== undefined && after.priority !== undefined && before.priority !== after.priority) {
    lines.push(
      `Priority changed from ${formatPriority(String(before.priority))} to ${formatPriority(String(after.priority))}`,
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(before, 'assigned_to_user_id') &&
    Object.prototype.hasOwnProperty.call(after, 'assigned_to_user_id') &&
    before.assigned_to_user_id !== after.assigned_to_user_id
  ) {
    if (before.assigned_to_user_id == null && after.assigned_to_user_id != null && String(after.assigned_to_user_id).trim()) {
      lines.push('Ticket assigned to an agent');
    } else if (before.assigned_to_user_id != null && after.assigned_to_user_id == null) {
      lines.push('Assignment cleared');
    } else {
      lines.push('Assignment updated');
    }
  }

  return lines.length > 0 ? lines : null;
}
