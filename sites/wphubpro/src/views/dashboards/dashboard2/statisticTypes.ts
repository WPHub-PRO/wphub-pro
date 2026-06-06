import type { IconType } from 'react-icons'

export type StatisticType = {
  icon: IconType
  title: string
  subtitle: string
  count: number
  /** `orange` = WPHub connection accent (`#ea580c`), used on user dashboard stat cards. */
  variant: 'info' | 'success' | 'warning' | 'danger' | 'orange'
  progress: number
}
