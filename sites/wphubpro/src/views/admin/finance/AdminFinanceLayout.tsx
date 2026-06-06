import PageMetaData from '@/components/PageMetaData'
import { ROUTE_PATHS } from '@/config/routePaths'
import { useDashboardNav } from '@/context/DashboardNavContext'
import { useAuth } from '@/domains/auth'
import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router'

const AdminFinanceLayout = () => {
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
      <PageMetaData title="Admin · Finance" />
      <div className="admin-finance-layout">
        <div className="p-3 p-lg-4 pt-4">
          <Outlet />
        </div>
      </div>
    </>
  )
}

export default AdminFinanceLayout
