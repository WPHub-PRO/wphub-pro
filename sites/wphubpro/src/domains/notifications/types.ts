export type InAppNotificationType =
  | 'library_update'
  | 'ticket_reply'
  | 'ticket_status'
  | 'ticket_priority'
  | 'subscription'
  | 'platform'

/** Stored on broadcast rows; direct rows use `none`. */
export type NotificationBroadcastAudience = 'none' | 'personal' | 'teams' | 'all' | string

export type InAppNotificationItem = {
  id: string
  createdAt: string
  type: InAppNotificationType | string
  eventKey?: string
  title: string
  body: string
  metadata: string | null
  isBroadcast: boolean
  readAt: string | null
  /** Appwrite team `$id` for scoped notifications; null = personal workspace. */
  teamId?: string | null
  broadcastAudience?: NotificationBroadcastAudience | null
}

export type NotificationActionKind = 'accept_team_invite' | 'decline_team_invite'

export type NotificationActionDescriptor = {
  action: NotificationActionKind | string
  label: string
  style?: 'primary' | 'secondary' | string
}

export type TeamInviteNotificationActionContext = {
  kind: 'team_invite'
  invite_id: string
  invite_token: string
  team_id?: string | null
  team_name?: string | null
  actions: NotificationActionDescriptor[]
}

export type NotificationMetadataObject = {
  event_key?: string
  action_context?: TeamInviteNotificationActionContext
  [key: string]: unknown
}

export type NotificationListResponse = {
  success?: boolean
  items: InAppNotificationItem[]
  unreadCount: number
}
