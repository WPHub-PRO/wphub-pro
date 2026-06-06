import { executeFunction } from '@/integrations/appwrite/executeFunction'
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite'
import type { PlatformEventCategory, PlatformEventRow, PlatformEventSeverity } from './types'

const FN = APPWRITE_FUNCTION_IDS.MESSAGING

export async function fetchPlatformEvents() {
  return executeFunction<{ success?: boolean; events: PlatformEventRow[] }>(
    FN,
    { action: 'platform_events_list' },
    { omitImpersonationHeaders: true },
  )
}

export async function upsertPlatformEvent(body: {
  event_key: string
  title: string
  category: PlatformEventCategory
  severity: PlatformEventSeverity
  notification_enabled: boolean
  notification_title: string
  notification_body: string
  email_enabled: boolean
  email_template_key: string
}) {
  return executeFunction<{ success?: boolean; event: PlatformEventRow }>(
    FN,
    { action: 'platform_events_upsert', ...body },
    { omitImpersonationHeaders: true },
  )
}
