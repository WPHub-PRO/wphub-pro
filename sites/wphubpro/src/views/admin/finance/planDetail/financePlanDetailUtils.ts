export function metaMap(metadata: { key: string; value: string }[]) {
  const o: Record<string, string> = {}
  for (const m of metadata) o[m.key] = m.value
  return o
}

export function formatPlanUnix(ts: number | undefined) {
  if (ts == null || !Number.isFinite(ts)) return '—'
  return new Date(ts * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function limitPayload(raw: string): number | string | null {
  const s = raw.trim()
  if (!s) return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? n : s
}

export const PLAN_TYPE_OPTIONS = [
  { value: 'personal plan', label: 'Personal plan' },
  { value: 'team plan', label: 'Team plan' },
] as const

export type PlanSettingsSectionKey = 'details' | 'limits' | 'pricing'

export const PLAN_SETTINGS_SECTIONS: { key: PlanSettingsSectionKey; label: string }[] = [
  { key: 'details', label: 'Plan details' },
  { key: 'limits', label: 'Limits' },
  { key: 'pricing', label: 'Pricing' },
]
