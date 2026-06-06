import { executeFunction } from '@/integrations/appwrite/executeFunction'
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite'
import type { NotificationTemplateEventKey } from './events'

const FN = APPWRITE_FUNCTION_IDS.MESSAGING

export type NotificationTemplateRow = {
  $id: string
  event_key: string
  title_template: string
  body_template: string
  enabled: boolean
  updatedAt?: string | null
}

export async function fetchNotificationTemplates() {
  return executeFunction<{ success?: boolean; items: NotificationTemplateRow[] }>(
    FN,
    { action: 'notification_templates_list' },
    { omitImpersonationHeaders: true },
  )
}

export async function upsertNotificationTemplate(body: {
  event_key: NotificationTemplateEventKey | string
  title_template: string
  body_template: string
  enabled: boolean
  documentId?: string
}) {
  const { action: _ignoredAction, ...safeBody } = body as typeof body & { action?: string }
  return executeFunction<{ success?: boolean; documentId?: string }>(
    FN,
    { ...safeBody, action: 'notification_templates_upsert' },
    { omitImpersonationHeaders: true },
  )
}

export async function sendTestFromTemplate(body: {
  event_key: string
  recipient_user_id: string
  payload: Record<string, string>
}) {
  return executeFunction<{ success?: boolean }>(
    FN,
    { action: 'notification_send_from_template', ...body },
    { omitImpersonationHeaders: true },
  )
}
