import { useAuth } from '@/domains/auth'
import { useWorkspaceContext } from '@/domains/workspace'
import type { MenuItemType } from '@/types/layout'
import { useMemo } from 'react'
import { useInAppNotificationList } from './hooks'

const NOTIFICATIONS_MENU_KEY = 'notifications'

/**
 * Adds `countBadge` to the Notifications sidebar row for the loaded workspace.
 */
export function useNavMenuWithNotificationCount(items: MenuItemType[]): MenuItemType[] {
  const { user } = useAuth()
  const { mode, activeTeamId } = useWorkspaceContext()
  const { data } = useInAppNotificationList({
    enabled: Boolean(user),
    scope: 'workspace',
    activeTeamId: mode === 'team' ? activeTeamId : null,
  })
  const unread = data?.unreadCount ?? 0

  return useMemo(() => {
    if (unread <= 0) return items
    return items.map((item) =>
      item.key === NOTIFICATIONS_MENU_KEY ? { ...item, countBadge: unread } : item,
    )
  }, [items, unread])
}

export function formatNotificationCountLabel(count: number): string {
  return count >= 99 ? '99+' : String(count)
}
