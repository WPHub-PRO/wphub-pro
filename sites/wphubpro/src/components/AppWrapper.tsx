import QueryProvider from '@/components/QueryProvider'
import { PlatformBrandingProvider } from '@/context/PlatformBrandingContext'
import { LayoutProvider } from '@/context/useLayoutContext'
import { NotificationProvider } from '@/context/useNotificationContext'
import { AuthProvider } from '@/domains/auth'
import { DocsProvider } from '@/domains/docs/DocsContext'
import type { ChildrenType } from '@/types'

const AppWrapper = ({ children }: ChildrenType) => {
  return (
    <QueryProvider>
      <PlatformBrandingProvider>
        <AuthProvider>
          <DocsProvider>
            <LayoutProvider>
              <NotificationProvider>{children}</NotificationProvider>
            </LayoutProvider>
          </DocsProvider>
        </AuthProvider>
      </PlatformBrandingProvider>
    </QueryProvider>
  )
}

export default AppWrapper
