import { DocHelpButton } from '@/components/docs/DocHelpButton'
import PageMetaData from '@/components/PageMetaData'
import { ROUTE_PATHS } from '@/config/routePaths'
import { useDashboardNav } from '@/context/DashboardNavContext'
import { useAuth } from '@/domains/auth'
import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'

const AdminCommunicationLayout = () => {
  const { isAdmin } = useAuth()
  const { setMode } = useDashboardNav()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAdmin) {
      navigate(ROUTE_PATHS.DASHBOARD, { replace: true })
      return
    }
    setMode('admin')
  }, [isAdmin, navigate, setMode])

  if (!isAdmin) {
    return null
  }

  return (
    <>
      <PageMetaData title="Admin · Communication" />
      <div className="admin-communication-layout">
        <header className="border-bottom border-light py-3">
          <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-md-between gap-2">
            <div>
              <h4 className="mb-0">Communication</h4>
              <p className="text-muted small mb-0 mt-1">
                In-app notifications, plus transactional e-mail (Resend / webhook) and templates.
              </p>
            </div>
            <DocHelpButton contextKey="admin:communication" />
          </div>
        </header>
        <div className="p-3 p-lg-4 pt-4">
          <Outlet />
        </div>
      </div>
    </>
  )
}

export default AdminCommunicationLayout
