import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/domains/auth'
import { fetchNotificationList, markNotificationRead } from './api'
import type { NotificationListResponse } from './types'

const QK = ['inAppNotifications'] as const

export function useInAppNotificationList(opts?: {
  enabled?: boolean
  scope?: 'topbar' | 'workspace'
  activeTeamId?: string | null
}) {
  const { user } = useAuth()
  const enabled = opts?.enabled !== false
  const scope = opts?.scope ?? 'topbar'
  const activeTeamId = opts?.activeTeamId
  return useQuery({
    queryKey: [...QK, 'list', user?.$id, scope, activeTeamId ?? ''],
    queryFn: async () => {
      const res = await fetchNotificationList(80, { scope, activeTeamId })
      if (res && typeof res === 'object' && 'items' in res) {
        return res
      }
      return { items: [], unreadCount: 0 }
    },
    enabled: enabled && Boolean(user),
    refetchInterval: 60_000,
    staleTime: 15_000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onMutate: async (notificationId) => {
      await qc.cancelQueries({ queryKey: QK })
      const snapshots = qc.getQueriesData<NotificationListResponse>({ queryKey: QK })

      qc.setQueriesData<NotificationListResponse>({ queryKey: QK }, (old) => {
        if (!old) return old
        const wasUnread = old.items.some((n) => n.id === notificationId && !n.readAt)
        const items = old.items.filter((n) => n.id !== notificationId)
        return {
          ...old,
          items,
          unreadCount: wasUnread ? Math.max(0, old.unreadCount - 1) : items.length,
        }
      })

      return { snapshots }
    },
    onError: (_error, _notificationId, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        qc.setQueryData(key, data)
      }
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: QK })
    },
  })
}

