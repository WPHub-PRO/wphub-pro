import PageBreadcrumb from '@/components/PageBreadcrumb'
import PageMetaData from '@/components/PageMetaData'
import { ROUTE_PATHS } from '@/config/routePaths'
import { useNotificationContext } from '@/context/useNotificationContext'
import { useAuth } from '@/domains/auth'
import { parseNotificationMetadata } from '@/domains/notifications/api'
import { useInAppNotificationList, useMarkNotificationRead } from '@/domains/notifications/hooks'
import { formatNotificationScopeLabel } from '@/domains/notifications/topbarPrefs'
import type { InAppNotificationItem, NotificationActionDescriptor, TeamInviteNotificationActionContext } from '@/domains/notifications/types'
import { teamInviteClaimAuthed, teamInviteDeclineAuthed, useTeamsList } from '@/domains/teams'
import { useSetActiveWorkspace, useWorkspaceContext } from '@/domains/workspace'
import { AppwriteFunctionError } from '@/integrations/appwrite/errors'
import { useMemo, useState } from 'react'
import { Badge, Button, Card, ListGroup, Spinner } from 'react-bootstrap'
import { Link, useNavigate } from 'react-router'

function errorMessage(error: unknown): string {
  if (error instanceof AppwriteFunctionError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}

function teamInviteActionsForNotification(item: InAppNotificationItem): TeamInviteNotificationActionContext | null {
  const metadata = parseNotificationMetadata(item.metadata)
  const ctx = metadata?.action_context
  if (!ctx || ctx.kind !== 'team_invite') return null
  if (!ctx.invite_id?.trim() || !ctx.invite_token?.trim()) return null
  if (!Array.isArray(ctx.actions) || ctx.actions.length === 0) return null
  return ctx
}

const NotificationsInboxPage = () => {
  const { user } = useAuth()
  const { mode, activeTeamId } = useWorkspaceContext()
  const teamsQ = useTeamsList(Boolean(user))
  const teamNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const row of teamsQ.data ?? []) {
      m.set(row.team.$id, row.team.name)
    }
    return m
  }, [teamsQ.data])
  const navigate = useNavigate()
  const { showNotification } = useNotificationContext()
  const { data, isLoading, error, refetch } = useInAppNotificationList({
    enabled: Boolean(user),
    scope: 'workspace',
    activeTeamId: mode === 'team' ? activeTeamId : null,
  })
  const markRead = useMarkNotificationRead()
  const setWorkspace = useSetActiveWorkspace()
  const [actingNotificationId, setActingNotificationId] = useState<string | null>(null)
  const items = data?.items ?? []

  const notificationActionMap = useMemo(() => {
    const out = new Map<string, TeamInviteNotificationActionContext>()
    for (const item of items) {
      const ctx = teamInviteActionsForNotification(item)
      if (ctx) out.set(item.id, ctx)
    }
    return out
  }, [items])

  const inboxSubtitle = useMemo(() => {
    if (mode === 'team' && activeTeamId) {
      return `Inbox · ${teamNameById.get(activeTeamId) || 'Team workspace'}`
    }
    return 'Inbox · Personal workspace'
  }, [mode, activeTeamId, teamNameById])

  const handleAction = async (item: InAppNotificationItem, action: NotificationActionDescriptor) => {
    const ctx = notificationActionMap.get(item.id)
    if (!ctx) return

    setActingNotificationId(item.id)
    try {
      if (action.action === 'accept_team_invite') {
        const claimed = await teamInviteClaimAuthed({
          inviteId: ctx.invite_id,
          token: ctx.invite_token,
        })
        if (!claimed.success) {
          throw new Error(claimed.message || 'Could not accept invitation.')
        }

        const teamId = String(claimed.teamId || ctx.team_id || '').trim()
        if (teamId) {
          await setWorkspace.mutateAsync({ activeTeamId: teamId, skipDashboardRedirect: true })
        }
        await markRead.mutateAsync(item.id)
        await refetch()
        showNotification({
          title: 'Team invite',
          message: teamId ? 'Invitation accepted. Switched to the team workspace.' : 'Invitation accepted.',
          variant: 'success',
        })
        if (teamId) navigate(ROUTE_PATHS.teamPath(teamId))
        return
      }

      if (action.action === 'decline_team_invite') {
        const declined = await teamInviteDeclineAuthed({
          inviteId: ctx.invite_id,
          token: ctx.invite_token,
        })
        if (!declined.success) {
          throw new Error(declined.message || 'Could not decline invitation.')
        }

        await markRead.mutateAsync(item.id)
        await refetch()
        showNotification({
          title: 'Team invite',
          message: 'Invitation declined.',
          variant: 'success',
        })
      }
    } catch (actionError) {
      showNotification({
        title: 'Notification action',
        message: errorMessage(actionError),
        variant: 'danger',
      })
    } finally {
      setActingNotificationId(null)
    }
  }

  return (
    <>
      <PageMetaData title="Notifications" />
      <PageBreadcrumb title="Notifications" subtitle={inboxSubtitle} />
      {isLoading && (
        <div className="text-center py-5">
          <Spinner animation="border" />
        </div>
      )}
      {error && (
        <p className="text-danger small">
          {error instanceof Error ? error.message : 'Could not load notifications.'}
        </p>
      )}
      {!isLoading && !error && (
        <Card>
          <Card.Body className="d-flex justify-content-between align-items-center py-2">
            <span className="text-muted small">
              {typeof data?.unreadCount === 'number' ? `${data.unreadCount} unread` : ''}
            </span>
            <Button variant="soft-primary" size="sm" onClick={() => void refetch()}>
              Refresh
            </Button>
          </Card.Body>
          <ListGroup variant="flush">
            {items.length === 0 && (
              <ListGroup.Item className="text-muted text-center py-4">No unread notifications.</ListGroup.Item>
            )}
            {items.map((n) => {
              const actionContext = notificationActionMap.get(n.id)
              const isActing = actingNotificationId === n.id

              return (
                <ListGroup.Item key={n.id} className="bg-light-subtle">
                  <div className="d-flex justify-content-between gap-2 align-items-start">
                    <div className="flex-grow-1">
                      <div className="fw-semibold">{n.title}</div>
                      {n.body ? <p className="mb-1 small text-muted">{n.body}</p> : null}
                      <div className="fs-xs text-muted">
                        {new Date(n.createdAt).toLocaleString()} · {n.type}
                      </div>
                      <div className="mt-1">
                        <Badge bg="secondary" className="fw-normal">
                          {formatNotificationScopeLabel(n, teamNameById)}
                        </Badge>
                      </div>
                      {actionContext ? (
                        <div className="d-flex flex-wrap gap-2 mt-3">
                          {actionContext.actions.map((action) => (
                            <Button
                              key={action.action}
                              variant={action.style === 'secondary' ? 'outline-secondary' : 'primary'}
                              size="sm"
                              disabled={isActing || markRead.isPending || setWorkspace.isPending}
                              onClick={() => void handleAction(n, action)}
                            >
                              {isActing ? 'Working…' : action.label}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      disabled={markRead.isPending || isActing}
                      onClick={() =>
                        markRead.mutate(n.id, {
                          onError: (error) => {
                            showNotification({
                              title: 'Notifications',
                              message: errorMessage(error),
                              variant: 'danger',
                            })
                          },
                        })
                      }
                    >
                      Mark read
                    </Button>
                  </div>
                </ListGroup.Item>
              )
            })}
          </ListGroup>
        </Card>
      )}
      <p className="mt-3 small text-muted mb-0">
        <Link to={ROUTE_PATHS.DASHBOARD}>Back to dashboard</Link>
      </p>
    </>
  )
}

export default NotificationsInboxPage
