import { TbChartBar, TbCreditCard, TbSettings } from 'react-icons/tb'

export const PLAN_DETAIL_TAB_KEYS = ['settings', 'subscriptions', 'analytics'] as const
export type PlanDetailTabKey = (typeof PLAN_DETAIL_TAB_KEYS)[number]

export const PLAN_DETAIL_TAB_CONFIG: Record<
  PlanDetailTabKey,
  { label: string; Icon: typeof TbSettings }
> = {
  settings: { label: 'Plan settings', Icon: TbSettings },
  subscriptions: { label: 'Subscriptions', Icon: TbCreditCard },
  analytics: { label: 'Analytics', Icon: TbChartBar },
}

export function planDetailTabIndexFromKey(k: string | null): number {
  if (!k) return 0
  const idx = PLAN_DETAIL_TAB_KEYS.indexOf(k as PlanDetailTabKey)
  return idx >= 0 ? idx : 0
}
