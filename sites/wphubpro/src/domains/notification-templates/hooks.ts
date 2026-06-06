import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchNotificationTemplates, upsertNotificationTemplate } from './api'
import type { NotificationTemplateEventKey } from './events'

const Q = ['admin', 'messaging', 'notificationTemplates'] as const

export function useNotificationTemplatesList() {
  return useQuery({
    queryKey: [...Q, 'list'],
    queryFn: () => fetchNotificationTemplates(),
  })
}

export function useNotificationTemplateUpsert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: {
      event_key: NotificationTemplateEventKey | string
      title_template: string
      body_template: string
      enabled: boolean
      documentId?: string
    }) => upsertNotificationTemplate(p),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...Q] })
    },
  })
}
