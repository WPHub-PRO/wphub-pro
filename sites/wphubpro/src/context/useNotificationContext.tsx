import type { ChildrenType } from '@/types'
import { createContext, use, useCallback, useMemo, useRef, useState } from 'react'
import { ToastBody, ToastHeader } from 'react-bootstrap'
import Toast, { type ToastProps } from 'react-bootstrap/Toast'
import ToastContainer from 'react-bootstrap/ToastContainer'

export const DEFAULT_TOAST_DELAY_MS = 30_000
const MAX_VISIBLE_TOASTS = 4

type ShowNotificationType = {
  title?: string
  message: string
  variant?: ToastProps['bg']
  delay?: number
}

type ToastItem = {
  id: string
  title?: string
  message: string
  variant: ToastProps['bg']
  delay: number
}

type NotificationContextType = {
  showNotification: ({ title, message, variant }: ShowNotificationType) => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

function ToastStack({
  toasts,
  onDismiss,
}: Readonly<{
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}>) {
  if (toasts.length === 0) return null

  return (
    <ToastContainer className="m-3 position-fixed notification-toast-stack" position="top-end">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          bg={toast.variant}
          delay={toast.delay}
          show
          autohide
          onClose={() => onDismiss(toast.id)}
        >
          {toast.title && (
            <ToastHeader className={`text-${toast.variant}`}>
              <strong className="me-auto">{toast.title}</strong>
            </ToastHeader>
          )}
          <ToastBody
            className={['dark', 'danger', 'success', 'primary'].includes(String(toast.variant))
              ? 'text-white'
              : ''}
          >
            {toast.message}
          </ToastBody>
        </Toast>
      ))}
    </ToastContainer>
  )
}

export function useNotificationContext() {
  const context = use(NotificationContext)
  if (!context) {
    throw new Error('useNotificationContext must be used within an NotificationProvider')
  }
  return context
}

export function NotificationProvider({ children }: ChildrenType) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextToastIdRef = useRef(0)

  const dismissNotification = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const showNotification = useCallback(
    ({ title, message, variant, delay = DEFAULT_TOAST_DELAY_MS }: ShowNotificationType) => {
      nextToastIdRef.current += 1
      const id = `toast-${nextToastIdRef.current}`
      const nextToast: ToastItem = {
        id,
        title,
        message,
        variant: variant ?? 'light',
        delay,
      }
      setToasts((prev) => {
        const next = [nextToast, ...prev]
        return next.length > MAX_VISIBLE_TOASTS ? next.slice(0, MAX_VISIBLE_TOASTS) : next
      })
    },
    [],
  )

  const contextValue = useMemo(() => ({ showNotification }), [showNotification])

  return (
    <NotificationContext.Provider value={contextValue}>
      <ToastStack toasts={toasts} onDismiss={dismissNotification} />
      {children}
    </NotificationContext.Provider>
  )
}
