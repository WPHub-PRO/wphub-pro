import { useAuth } from '@/domains/auth'
import { useDashboardNav } from '@/context/DashboardNavContext'

/**
 * True only when the account has the admin label and the workspace switcher is on Admin.
 * In member scope (personal or team workspace), the same session behaves like a normal member for UI and client-gated queries.
 */
export function useEffectiveIsAdmin(): boolean {
  const { isAdmin } = useAuth()
  const { mode } = useDashboardNav()
  return Boolean(isAdmin && mode === 'admin')
}
