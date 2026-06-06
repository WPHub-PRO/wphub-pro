import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPlatformEvents, upsertPlatformEvent } from './api'
import type { PlatformEventCategory, PlatformEventSeverity } from './types'

const Q = ['admin', 'messaging', 'platformEvents'] as const

export function usePlatformEventsList() {
  return useQuery({
    queryKey: [...Q, 'list'],
    queryFn: () => fetchPlatformEvents(),
  })
}

export function usePlatformEventUpsert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: {
      event_key: string
      title: string
      category: PlatformEventCategory
      severity: PlatformEventSeverity
      notification_enabled: boolean
      notification_title: string
      notification_body: string
      email_enabled: boolean
      email_template_key: string
    }) => upsertPlatformEvent(p),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...Q] })
    },
  })
}
