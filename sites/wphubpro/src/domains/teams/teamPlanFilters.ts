import type { StripePlan, StripePlanMetadata } from '@/types';

function metaValue(metadata: StripePlanMetadata[] | undefined, key: string): string | undefined {
  const k = key.toLowerCase();
  const hit = metadata?.find((e) => String(e.key).toLowerCase() === k);
  const v = hit?.value;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/** Stripe products intended for team checkout (`wphub_track=team` or legacy `type` containing "team"). */
export function isTeamTrackPlan(plan: StripePlan): boolean {
  const track = (metaValue(plan.metadata, 'wphub_track') || '').toLowerCase();
  if (track === 'team') return true;
  const typeMeta = (metaValue(plan.metadata, 'type') || '').toLowerCase();
  if (typeMeta.includes('team')) return true;
  const catalog = (plan.catalogPlanType || '').toLowerCase();
  if (catalog.includes('team')) return true;
  return false;
}

/**
 * Seat count for team checkout, from Stripe product metadata `seats_included` (required for team checkout UX).
 */
export function planSeatsIncluded(plan: StripePlan): number | null {
  const raw = metaValue(plan.metadata, 'seats_included');
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(999, Math.floor(n));
}
