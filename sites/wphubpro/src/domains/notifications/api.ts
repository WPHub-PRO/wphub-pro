import { executeFunction } from '@/integrations/appwrite/executeFunction'
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite'
import type { NotificationListResponse, NotificationMetadataObject } from './types'

const FN = APPWRITE_FUNCTION_IDS.MESSAGING

export async function fetchNotificationList(
  limit = 40,
  opts?: { scope?: 'topbar' | 'workspace'; activeTeamId?: string | null },
) {
  return executeFunction<NotificationListResponse>(FN, {
    action: 'notification_list',
    limit,
    scope: opts?.scope,
    activeTeamId: opts?.activeTeamId === undefined ? undefined : opts.activeTeamId,
  })
}

export async function markNotificationRead(notificationId: string) {
  return executeFunction<{ success?: boolean }>(FN, {
    action: 'notification_mark_read',
    notificationId,
  })
}

export function parseNotificationMetadata(metadata: string | null | undefined): NotificationMetadataObject | null {
  if (!metadata?.trim()) return null
  try {
    const parsed: unknown = JSON.parse(metadata)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as NotificationMetadataObject
  } catch {
    return null
  }
}
