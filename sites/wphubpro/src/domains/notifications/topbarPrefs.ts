import type { InAppNotificationItem } from './types'

/** Keep keys aligned with `functions-lib/notificationPrefs.js` (`parseTopbarNotificationPrefs`). */
export const TOPBAR_NOTIF_TEAM_IDS_PREF = 'wphub_topbar_notif_team_ids' as const
export const TOPBAR_NOTIF_PERSONAL_PREF = 'wphub_topbar_notif_personal' as const

export type TopbarNotificationPrefsParsed = {
  /** When false, user has never set topbar filters — treat as all teams + personal on. */
  explicit: boolean
  enabledTeamIds: Set<string>
  personalEnabled: boolean
}

export function parseTopbarNotificationPrefsFromRecord(prefs: Record<string, unknown> | null | undefined): TopbarNotificationPrefsParsed {
  if (!prefs || typeof prefs !== 'object') {
    return { explicit: false, enabledTeamIds: new Set(), personalEnabled: true }
  }
  const hasT = Object.prototype.hasOwnProperty.call(prefs, TOPBAR_NOTIF_TEAM_IDS_PREF)
  const hasP = Object.prototype.hasOwnProperty.call(prefs, TOPBAR_NOTIF_PERSONAL_PREF)
  if (!hasT && !hasP) {
    return { explicit: false, enabledTeamIds: new Set(), personalEnabled: true }
  }
  const raw = prefs[TOPBAR_NOTIF_TEAM_IDS_PREF]
  const enabledTeamIds = new Set<string>()
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const s = String(x).trim()
      if (s) enabledTeamIds.add(s)
    }
  }
  const personalEnabled = prefs[TOPBAR_NOTIF_PERSONAL_PREF] !== false
  return { explicit: true, enabledTeamIds, personalEnabled }
}

export function formatNotificationScopeLabel(item: InAppNotificationItem, teamNameById: Map<string, string>): string {
  if (item.isBroadcast) {
    const aud = String(item.broadcastAudience || 'all').toLowerCase()
    if (aud === 'personal') return 'Personal workspaces'
    if (aud === 'teams') return 'All teams'
    return 'Everyone'
  }
  const tid = item.teamId?.trim()
  if (!tid) return 'Personal'
  return teamNameById.get(tid) || `Team ${tid.slice(0, 10)}`
}
