export type PlatformEventCategory =
  | 'platform'
  | 'site'
  | 'billing'
  | 'workspace'
  | 'account'
  | 'library'
  | 'team'
  | 'subscription'

export type PlatformEventSeverity = 'info' | 'warning' | 'high_risk'

export type PlatformEventRow = {
  $id: string
  event_key: string
  title: string
  category: PlatformEventCategory
  severity: PlatformEventSeverity
  notification_enabled: boolean
  notification_title: string
  notification_body: string
  email_enabled: boolean
  email_template_key: string
}
