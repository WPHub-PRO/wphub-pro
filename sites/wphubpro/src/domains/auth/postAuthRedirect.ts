import { ROUTE_PATHS } from '@/config/routePaths'

/** Query key for post-login / post-OAuth in-app destination (path + optional search). */
export const POST_AUTH_REDIRECT_QUERY_KEY = 'redirect' as const

function pathnameOf(pathWithSearch: string): string {
  const i = pathWithSearch.indexOf('?')
  return i === -1 ? pathWithSearch : pathWithSearch.slice(0, i)
}

/**
 * In-app path + optional search. Rejects protocol-relative URLs and auth screens (avoid redirect loops).
 */
export function isSafeInternalPostAuthPath(pathWithSearch: string): boolean {
  if (!pathWithSearch.startsWith('/') || pathWithSearch.startsWith('//')) {
    return false
  }
  const pathname = pathnameOf(pathWithSearch)
  if (pathname === ROUTE_PATHS.LOGIN || pathname === ROUTE_PATHS.REGISTER) {
    return false
  }
  return true
}

/** Decode `redirect` query value to path+search; returns null if invalid. */
export function parseRedirectQueryParam(raw: string | null): string | null {
  if (raw == null || raw === '') {
    return null
  }
  try {
    const decoded = decodeURIComponent(raw.replace(/\+/g, ' '))
    return isSafeInternalPostAuthPath(decoded) ? decoded : null
  } catch {
    return null
  }
}

type NavigateState = {
  from?: { pathname?: string; search?: string }
  pathname?: string
  search?: string
} | null

/** Safe in-app path from React Router `Navigate` state (e.g. ProtectedRoute `state.from`). */
export function postAuthPathFromRouterState(state: unknown): string {
  const s = state as NavigateState
  const loc = s?.from ?? s
  const p = loc?.pathname
  const search = loc?.search
  if (typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//')) {
    return ROUTE_PATHS.DASHBOARD
  }
  const combined = `${p}${typeof search === 'string' ? search : ''}`
  return isSafeInternalPostAuthPath(combined) ? combined : ROUTE_PATHS.DASHBOARD
}

/** Query wins when present and valid; otherwise `state` (e.g. `from` from ProtectedRoute). */
export function resolvePostAuthPath(state: unknown, redirectQueryRaw: string | null): string {
  const fromQuery = parseRedirectQueryParam(redirectQueryRaw)
  if (fromQuery) {
    return fromQuery
  }
  return postAuthPathFromRouterState(state)
}

/**
 * Appwrite OAuth success/failure URLs for GitHub sign-in.
 * Optional `nextPath`: when set and safe (not dashboard, not auth loop), embedded as `redirect` query.
 */
export function buildGitHubOAuthLoginUrls(nextPath?: string): { success: string; failure: string } {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const login = `${origin}${ROUTE_PATHS.LOGIN}`
  const dash = ROUTE_PATHS.DASHBOARD
  const wantRedirect =
    typeof nextPath === 'string' && nextPath !== dash && isSafeInternalPostAuthPath(nextPath)

  const successParams = new URLSearchParams()
  if (wantRedirect) {
    successParams.set(POST_AUTH_REDIRECT_QUERY_KEY, nextPath)
  }
  const successQs = successParams.toString()
  const success = successQs ? `${login}?${successQs}` : login

  const failureParams = new URLSearchParams()
  failureParams.set('oauth', 'github_error')
  if (wantRedirect) {
    failureParams.set(POST_AUTH_REDIRECT_QUERY_KEY, nextPath)
  }
  return {
    success,
    failure: `${login}?${failureParams.toString()}`,
  }
}
