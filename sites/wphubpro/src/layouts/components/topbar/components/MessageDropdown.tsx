import { ROUTE_PATHS } from '@/config/routePaths'
import { useNotificationContext } from '@/context/useNotificationContext'
import { useAuth } from '@/domains/auth'
import { useInAppNotificationList, useMarkNotificationRead } from '@/domains/notifications/hooks'
import { AppwriteFunctionError } from '@/integrations/appwrite/errors'
import { formatNotificationScopeLabel } from '@/domains/notifications/topbarPrefs'
import { useTeamsList } from '@/domains/teams'
import { Button, Col, Dropdown, DropdownItem, DropdownMenu, DropdownToggle, Row, Badge } from 'react-bootstrap'
import { LuBell } from 'react-icons/lu'
import { TbBell } from 'react-icons/tb'
import SimpleBar from 'simplebar-react'
import { Link } from 'react-router'
import { useMemo } from 'react'

function markReadErrorMessage(error: unknown): string {
  if (error instanceof AppwriteFunctionError) return error.message
  if (error instanceof Error) return error.message
  return 'Could not mark notification as read.'
}

const MessageDropdown = () => {
  const { user } = useAuth()
  const { showNotification } = useNotificationContext()
  const teamsQ = useTeamsList(Boolean(user))
  const teamNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const row of teamsQ.data ?? []) {
      m.set(row.team.$id, row.team.name)
    }
    return m
  }, [teamsQ.data])

  const { data, isLoading } = useInAppNotificationList({
    enabled: Boolean(user),
    scope: 'topbar',
  })
  const markRead = useMarkNotificationRead()
  const items = (data?.items ?? []).slice(0, 8)
  const unread = data?.unreadCount ?? 0

  return (
    <div className="topbar-item">
      <Dropdown align="end">
        <DropdownToggle as={'button'} className="topbar-link dropdown-toggle drop-arrow-none" aria-label="Notifications">
          <LuBell className="fs-xxl" />
          {unread > 0 && (
            <span className="badge text-bg-danger badge-circle topbar-badge">{unread > 99 ? '99+' : unread}</span>
          )}
        </DropdownToggle>

        <DropdownMenu className="p-0 dropdown-menu-end dropdown-menu-lg">
          <div className="px-3 py-2 border-bottom">
            <Row className="align-items-center">
              <Col>
                <h6 className="m-0 fs-md fw-semibold">Notifications</h6>
              </Col>
              <Col className="text-end">
                <Link to={ROUTE_PATHS.NOTIFICATIONS} className="badge badge-soft-success badge-label py-1">
                  {unread > 0 ? `${unread} unread` : 'Inbox'}
                </Link>
              </Col>
            </Row>
          </div>

          <SimpleBar style={{ maxHeight: '300px' }}>
            {isLoading && (
              <div className="px-3 py-3 text-muted small">Loading…</div>
            )}
            {!isLoading && items.length === 0 && (
              <div className="px-3 py-3 text-muted small">No unread notifications.</div>
            )}
            {!isLoading &&
              items.map((n) => (
                <DropdownItem
                  as="div"
                  className={`notification-item py-2 text-wrap ${!n.readAt ? 'active' : ''}`}
                  key={n.id}
                >
                  <span className="d-flex gap-3 align-items-start">
                    <span className="avatar-md flex-shrink-0 position-relative">
                      <span className="avatar-title rounded-circle fs-22 bg-light">
                        <TbBell className="fs-4 text-primary" />
                      </span>
                    </span>
                    <span className="flex-grow-1 text-muted min-w-0">
                      <Badge bg="light" text="dark" className="fw-normal mb-1 border">
                        {formatNotificationScopeLabel(n, teamNameById)}
                      </Badge>
                      <span className="fw-medium text-body d-block">{n.title}</span>
                      {n.body ? (
                        <span className="d-block text-truncate-2 small">{n.body}</span>
                      ) : null}
                      <span className="fs-xs">{new Date(n.createdAt).toLocaleString()}</span>
                    </span>
                    {!n.readAt && (
                      <Button
                        variant="link"
                        type="button"
                        className="flex-shrink-0 p-0 small"
                        onClick={() =>
                          markRead.mutate(n.id, {
                            onError: (error) => {
                              showNotification({
                                title: 'Notifications',
                                message: markReadErrorMessage(error),
                                variant: 'danger',
                                delay: 5000,
                              })
                            },
                          })
                        }
                      >
                        Read
                      </Button>
                    )}
                  </span>
                </DropdownItem>
              ))}
          </SimpleBar>

          <Link
            to={ROUTE_PATHS.NOTIFICATIONS}
            className="dropdown-item text-center text-reset text-decoration-underline link-offset-2 fw-bold notify-item border-top border-light py-2"
          >
            View all notifications
          </Link>
        </DropdownMenu>
      </Dropdown>
    </div>
  )
}

export default MessageDropdown
