import Loader from '@/components/Loader'
import { ROUTE_PATHS } from '@/config/routePaths'
import { useAuth } from '@/domains/auth'
import { parseRedirectQueryParam, POST_AUTH_REDIRECT_QUERY_KEY } from '@/domains/auth/postAuthRedirect'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'

/** Renders auth pages only when logged out; redirects to dashboard when already authenticated. */
export function AuthScreenGate({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <Loader height="100vh" />
  }

  if (user) {
    const target = parseRedirectQueryParam(new URLSearchParams(location.search).get(POST_AUTH_REDIRECT_QUERY_KEY))
    if (target) {
      return <Navigate to={target} replace />
    }
    return <Navigate to={ROUTE_PATHS.DASHBOARD} replace />
  }

  return <>{children}</>
}
