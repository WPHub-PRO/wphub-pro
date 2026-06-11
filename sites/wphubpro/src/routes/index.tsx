import { AuthScreenGate } from '@/components/AuthScreenGate'
import Loader from '@/components/Loader'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { ROUTE_PATHS } from '@/config/routePaths'
import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, useParams, type RouteObject } from 'react-router'

const routeFallback = <Loader height="min(50vh, 420px)" width="100%" />

function Suspensed({ children }: { children: ReactNode }) {
  return <Suspense fallback={routeFallback}>{children}</Suspense>
}

const MainLayout = lazy(() => import('@/layouts/MainLayout.tsx'))
const AdminDashboardPage = lazy(() => import('@/views/admin'))
const AdminFinanceLayout = lazy(() => import('@/views/admin/finance/AdminFinanceLayout'))
const FinanceInvoicesPage = lazy(() => import('@/views/admin/finance/FinanceInvoicesPage'))
const AdminStripeDashboardPage = lazy(() => import('@/pages/admin/Dashboard'))
const InvoiceDetailPage = lazy(() => import('@/pages/admin/InvoiceDetail'))
const PlanDetailPage = lazy(() => import('@/pages/admin/PlanDetail'))
const PlanMgmtPage = lazy(() => import('@/pages/admin/PlanMgmt'))
const SubscriptionDetailPage = lazy(() => import('@/pages/admin/SubscriptionDetail'))
const SubscriptionMgmtPage = lazy(() => import('@/pages/admin/SubscriptionMgmt'))
const AdminCommunicationLayout = lazy(() => import('@/views/admin/communication/AdminCommunicationLayout'))
const AdminPlatformEventsPage = lazy(() => import('@/views/admin/communication/AdminPlatformEventsPage'))
const AdminSystemEmailsPage = lazy(() => import('@/views/admin/communication/AdminSystemEmailsPage'))
const AdminDocsManagerPage = lazy(() => import('@/views/admin/docs/AdminDocsManagerPage'))
const AdminPlatformSettingsPage = lazy(() => import('@/views/admin/settings'))
const AdminUsersOverviewPage = lazy(() => import('@/views/admin/users'))
const AdminTeamDetailPage = lazy(() => import('@/views/admin/teams/AdminTeamDetailPage'))
const AdminTeamsListPage = lazy(() => import('@/views/admin/teams/AdminTeamsListPage'))
const DocsArticlePage = lazy(() => import('@/views/docs/DocsArticlePage'))
const DocsHomePage = lazy(() => import('@/views/docs/DocsHomePage'))
const ConnectSuccessPage = lazy(() => import('@/views/connect/ConnectSuccessPage'))
const DashboardPage = lazy(() => import('@/views/dashboard'))
const LibraryPage = lazy(() => import('@/views/library'))
const LibraryItemDetailPage = lazy(() => import('@/views/library/detail/LibraryItemDetailPage'))
const LibraryFamilyDetailPage = lazy(() => import('@/views/library/detail/LibraryFamilyDetailPage'))
const LibraryCollectionDetailPage = lazy(() => import('@/views/library/detail/LibraryCollectionDetailPage'))
const SiteDetailPage = lazy(() => import('@/views/sites/detail/SiteDetailPage'))
const SiteExtensionDetailPage = lazy(() => import('@/views/sites/detail/SiteExtensionDetailPage'))
const SitesPage = lazy(() => import('@/views/sites'))
const AdminSupportTicketsPage = lazy(() => import('@/views/support/AdminSupportTicketsPage'))
const SupportTicketCreatePage = lazy(() => import('@/views/support/SupportTicketCreatePage'))
const SupportTicketDetailPage = lazy(() => import('@/views/support/SupportTicketDetailPage'))
const SupportTicketsListPage = lazy(() => import('@/views/support/SupportTicketsListPage'))
const NotificationsInboxPage = lazy(() => import('@/views/notifications/NotificationsInboxPage'))
const TeamsHubPage = lazy(() => import('@/views/teams/TeamsHubPage'))
const TeamBillingPage = lazy(() => import('@/views/teams/TeamBillingPage'))
const TeamDetailPage = lazy(() => import('@/views/teams/TeamDetailPage'))
const TeamSettingsPage = lazy(() => import('@/views/teams/TeamSettingsPage'))
const WorkspaceInboxComposePane = lazy(() => import('@/views/inbox/WorkspaceInboxComposePane'))
const WorkspaceInboxDetailPane = lazy(() => import('@/views/inbox/WorkspaceInboxDetailPane'))
const WorkspaceInboxListPane = lazy(() => import('@/views/inbox/WorkspaceInboxListPane'))
const WorkspaceInboxPage = lazy(() => import('@/views/inbox/WorkspaceInboxPage'))
const UserProfilePage = lazy(() => import('@/views/profile/UserProfilePage'))
const ForgotPasswordPage = lazy(() => import('@/views/auth/auth-1/reset-password'))
const LoginPage = lazy(() => import('@/views/auth/auth-1/sign-in'))
const NewPasswordPage = lazy(() => import('@/views/auth/auth-1/new-password'))
const RegisterPage = lazy(() => import('@/views/auth/auth-1/sign-up'))
const InviteRegisterPage = lazy(() => import('@/views/invite/InviteRegisterPage'))
const InviteTeamPage = lazy(() => import('@/views/invite/InviteTeamPage'))
const AiAccessPage = lazy(() => import('@/views/auth/AiAccessPage'))

function LegacyFinanceInvoiceRedirect() {
  const { invoiceId } = useParams<{ invoiceId: string }>()
  if (!invoiceId) return <Navigate to={ROUTE_PATHS.ADMIN_FINANCE_INVOICES} replace />
  return <Navigate to={ROUTE_PATHS.adminFinanceInvoicePath(invoiceId)} replace />
}

export const routes: RouteObject[] = [
  { path: '/auth-1/sign-in', element: <Navigate to={ROUTE_PATHS.LOGIN} replace /> },
  { path: '/auth-1/sign-up', element: <Navigate to={ROUTE_PATHS.REGISTER} replace /> },
  { path: '/auth-1/reset-password', element: <Navigate to={ROUTE_PATHS.FORGOT_PASSWORD} replace /> },
  {
    path: ROUTE_PATHS.INVITE_TEAM,
    element: (
      <Suspensed>
        <InviteTeamPage />
      </Suspensed>
    ),
  },
  {
    path: ROUTE_PATHS.REGISTER_INVITE,
    element: (
      <Suspensed>
        <InviteRegisterPage />
      </Suspensed>
    ),
  },
  {
    path: ROUTE_PATHS.AI_ACCESS,
    element: (
      <Suspensed>
        <AiAccessPage />
      </Suspensed>
    ),
  },
  {
    path: ROUTE_PATHS.LOGIN,
    element: (
      <AuthScreenGate>
        <Suspensed>
          <LoginPage />
        </Suspensed>
      </AuthScreenGate>
    ),
  },
  {
    path: ROUTE_PATHS.REGISTER,
    element: (
      <AuthScreenGate>
        <Suspensed>
          <RegisterPage />
        </Suspensed>
      </AuthScreenGate>
    ),
  },
  {
    path: ROUTE_PATHS.FORGOT_PASSWORD,
    element: (
      <AuthScreenGate>
        <Suspensed>
          <ForgotPasswordPage />
        </Suspensed>
      </AuthScreenGate>
    ),
  },
  {
    path: ROUTE_PATHS.RESET_PASSWORD,
    element: (
      <AuthScreenGate>
        <Suspensed>
          <NewPasswordPage />
        </Suspensed>
      </AuthScreenGate>
    ),
  },
  {
    path: '/',
    element: (
      <AuthScreenGate>
        <Navigate to={ROUTE_PATHS.LOGIN} replace />
      </AuthScreenGate>
    ),
  },
  {
    element: (
      <ProtectedRoute>
        <Suspensed>
          <MainLayout />
        </Suspensed>
      </ProtectedRoute>
    ),
    children: [
      {
        path: ROUTE_PATHS.DASHBOARD,
        element: (
          <Suspensed>
            <DashboardPage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.CONNECT_SUCCESS,
        element: (
          <Suspensed>
            <ConnectSuccessPage />
          </Suspensed>
        ),
      },
      {
        path: '/connect-success',
        element: (
          <Suspensed>
            <ConnectSuccessPage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.PROFILE,
        element: (
          <Suspensed>
            <UserProfilePage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.TEAMS,
        element: (
          <Suspensed>
            <TeamsHubPage />
          </Suspensed>
        ),
      },
      { path: ROUTE_PATHS.TEAM_NEW, element: <Navigate to={ROUTE_PATHS.TEAMS} replace /> },
      {
        path: `${ROUTE_PATHS.TEAMS}/:teamId/billing`,
        element: (
          <Suspensed>
            <TeamBillingPage />
          </Suspensed>
        ),
      },
      {
        path: `${ROUTE_PATHS.TEAMS}/:teamId/settings`,
        element: (
          <Suspensed>
            <TeamSettingsPage />
          </Suspensed>
        ),
      },
      {
        path: `${ROUTE_PATHS.TEAMS}/:teamId`,
        element: (
          <Suspensed>
            <TeamDetailPage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.SUPPORT,
        element: (
          <Suspensed>
            <SupportTicketsListPage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.SUPPORT_NEW,
        element: (
          <Suspensed>
            <SupportTicketCreatePage />
          </Suspensed>
        ),
      },
      {
        path: `${ROUTE_PATHS.SUPPORT}/:ticketId`,
        element: (
          <Suspensed>
            <SupportTicketDetailPage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.ADMIN_SUPPORT,
        element: (
          <Suspensed>
            <AdminSupportTicketsPage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.ADMIN_DASHBOARD,
        element: (
          <Suspensed>
            <AdminDashboardPage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.ADMIN_USERS,
        element: (
          <Suspensed>
            <AdminUsersOverviewPage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.ADMIN_TEAMS,
        element: (
          <Suspensed>
            <AdminTeamsListPage />
          </Suspensed>
        ),
      },
      {
        path: `${ROUTE_PATHS.ADMIN_TEAMS}/:teamId`,
        element: (
          <Suspensed>
            <AdminTeamDetailPage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.ADMIN_SETTINGS,
        element: (
          <Suspensed>
            <AdminPlatformSettingsPage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.ADMIN_DOCS,
        element: (
          <Suspensed>
            <AdminDocsManagerPage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.ADMIN_COMMUNICATION,
        element: (
          <Suspensed>
            <AdminCommunicationLayout />
          </Suspensed>
        ),
        children: [
          { index: true, element: <Navigate to="platform-events" replace /> },
          {
            path: 'platform-events',
            element: (
              <Suspensed>
                <AdminPlatformEventsPage />
              </Suspensed>
            ),
          },
          {
            path: 'notification-templates',
            element: <Navigate to="/admin/communication/platform-events" replace />,
          },
          {
            path: 'system-emails',
            element: (
              <Suspensed>
                <AdminSystemEmailsPage />
              </Suspensed>
            ),
          },
        ],
      },
      {
        path: ROUTE_PATHS.NOTIFICATIONS,
        element: (
          <Suspensed>
            <NotificationsInboxPage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.INBOX,
        element: (
          <Suspensed>
            <WorkspaceInboxPage />
          </Suspensed>
        ),
        children: [
          {
            index: true,
            element: (
              <Suspensed>
                <WorkspaceInboxListPane />
              </Suspensed>
            ),
          },
          {
            path: 'compose',
            element: (
              <Suspensed>
                <WorkspaceInboxComposePane />
              </Suspensed>
            ),
          },
          {
            path: ':messageUid',
            element: (
              <Suspensed>
                <WorkspaceInboxDetailPane />
              </Suspensed>
            ),
          },
        ],
      },
      {
        path: ROUTE_PATHS.DOCS,
        element: (
          <Suspensed>
            <DocsHomePage />
          </Suspensed>
        ),
      },
      {
        path: `${ROUTE_PATHS.DOCS}/a/:slug`,
        element: (
          <Suspensed>
            <DocsArticlePage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.ADMIN_FINANCE,
        element: (
          <Suspensed>
            <AdminFinanceLayout />
          </Suspensed>
        ),
        children: [
          { index: true, element: <Navigate to="dashboard" replace /> },
          {
            path: 'dashboard',
            element: (
              <Suspensed>
                <AdminStripeDashboardPage />
              </Suspensed>
            ),
          },
          {
            path: 'subscriptions',
            element: (
              <Suspensed>
                <SubscriptionMgmtPage />
              </Suspensed>
            ),
          },
          {
            path: 'subscriptions/:subscriptionId',
            element: (
              <Suspensed>
                <SubscriptionDetailPage />
              </Suspensed>
            ),
          },
          {
            path: 'plans',
            element: (
              <Suspensed>
                <PlanMgmtPage />
              </Suspensed>
            ),
          },
          {
            path: 'plans/:productId',
            element: (
              <Suspensed>
                <PlanDetailPage />
              </Suspensed>
            ),
          },
          { path: 'billing', element: <Navigate to="invoices" replace /> },
          { path: 'billing/invoices/:invoiceId', element: <LegacyFinanceInvoiceRedirect /> },
          {
            path: 'invoices',
            element: (
              <Suspensed>
                <FinanceInvoicesPage />
              </Suspensed>
            ),
          },
          {
            path: 'invoices/:invoiceId',
            element: (
              <Suspensed>
                <InvoiceDetailPage />
              </Suspensed>
            ),
          },
        ],
      },
      {
        path: ROUTE_PATHS.SITES,
        element: (
          <Suspensed>
            <SitesPage />
          </Suspensed>
        ),
      },
      {
        path: `${ROUTE_PATHS.SITES}/:siteId/plugins/:pluginId`,
        element: (
          <Suspensed>
            <SiteExtensionDetailPage />
          </Suspensed>
        ),
      },
      {
        path: `${ROUTE_PATHS.SITES}/:siteId/themes/:themeId`,
        element: (
          <Suspensed>
            <SiteExtensionDetailPage />
          </Suspensed>
        ),
      },
      {
        path: `${ROUTE_PATHS.SITES}/:siteId`,
        element: (
          <Suspensed>
            <SiteDetailPage />
          </Suspensed>
        ),
      },
      {
        path: `${ROUTE_PATHS.LIBRARY}/items/:itemKind/:itemSlug`,
        element: (
          <Suspensed>
            <LibraryItemDetailPage />
          </Suspensed>
        ),
      },
      {
        path: `${ROUTE_PATHS.LIBRARY}/families/:familyId`,
        element: (
          <Suspensed>
            <LibraryFamilyDetailPage />
          </Suspensed>
        ),
      },
      {
        path: `${ROUTE_PATHS.LIBRARY}/collections/:collectionId`,
        element: (
          <Suspensed>
            <LibraryCollectionDetailPage />
          </Suspensed>
        ),
      },
      {
        path: ROUTE_PATHS.LIBRARY,
        element: (
          <Suspensed>
            <LibraryPage />
          </Suspensed>
        ),
      },
    ],
  },
]
