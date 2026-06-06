/**
 * In-app notification list / topbar / workspace filtering (messaging function only).
 * Shared preference gate for creates stays in @wphub-pro/functions-lib (`notificationPrefs.js`).
 */

function inboxItemVisibleInPrefs(prefs, { type, eventKey }) {
  if (!prefs || typeof prefs !== 'object') return true;
  if (prefs.notifyPlatform === false) return false;
  const m = prefs.notificationEventPrefs;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return true;
  const ek = String(eventKey || '')
    .trim()
    .toLowerCase();
  const ty = String(type || '')
    .trim()
    .toLowerCase();
  if (ek && m[ek] === false) return false;
  if (ty && m[ty] === false) return false;
  return true;
}

function rowTeamIdFromDoc(doc) {
  const t = doc && doc.team_id;
  if (t == null || t === '') return null;
  const s = String(t).trim();
  return s || null;
}

function rowBroadcastAudienceFromDoc(doc) {
  if (!doc || doc.is_broadcast !== true) return 'none';
  const a = String(doc.broadcast_audience || '').trim().toLowerCase();
  if (a === 'personal' || a === 'teams' || a === 'all') return a;
  return 'all';
}

/**
 * @param {Record<string, unknown> | null | undefined} prefs
 * @returns {number | null}
 */
function parseRetentionCutoffMs(prefs) {
  if (!prefs || typeof prefs !== 'object') return null;
  const raw = prefs.notificationRetentionDays;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const days = Math.min(3650, Math.max(1, Math.floor(n)));
  return Date.now() - days * 86400000;
}

/**
 * @param {Record<string, unknown> | null | undefined} prefs
 */
function parseTopbarNotificationPrefs(prefs) {
  if (!prefs || typeof prefs !== 'object') {
    return { explicit: false, teamIds: new Set(), personal: true };
  }
  const hasT = Object.prototype.hasOwnProperty.call(prefs, 'wphub_topbar_notif_team_ids');
  const hasP = Object.prototype.hasOwnProperty.call(prefs, 'wphub_topbar_notif_personal');
  if (!hasT && !hasP) return { explicit: false, teamIds: new Set(), personal: true };
  const raw = prefs.wphub_topbar_notif_team_ids;
  const teamIds = new Set();
  if (Array.isArray(raw)) {
    for (const x of raw) {
      const s = String(x).trim();
      if (s) teamIds.add(s);
    }
  }
  const personal = prefs.wphub_topbar_notif_personal !== false;
  return { explicit: true, teamIds, personal };
}

function topbarAllowsDoc(parsed, doc) {
  if (!parsed.explicit) return true;
  const teamId = rowTeamIdFromDoc(doc);
  const isB = doc.is_broadcast === true;
  const aud = rowBroadcastAudienceFromDoc(doc);
  if (!isB) {
    if (teamId == null) return parsed.personal;
    return parsed.teamIds.has(teamId);
  }
  if (aud === 'all') return parsed.personal || parsed.teamIds.size > 0;
  if (aud === 'personal') return parsed.personal;
  if (aud === 'teams') return parsed.teamIds.size > 0;
  return true;
}

function workspaceAllowsDoc(doc, activeTeamId) {
  const isB = doc.is_broadcast === true;
  const tid = rowTeamIdFromDoc(doc);
  const aud = rowBroadcastAudienceFromDoc(doc);
  const teamWorkspace = activeTeamId != null && String(activeTeamId).trim() !== '';
  if (teamWorkspace) {
    const T = String(activeTeamId).trim();
    if (!isB) return tid === T;
    return aud === 'teams' || aud === 'all';
  }
  if (!isB) return tid == null;
  return aud === 'personal' || aud === 'all';
}

export {
  parseRetentionCutoffMs,
  inboxItemVisibleInPrefs,
  rowTeamIdFromDoc,
  rowBroadcastAudienceFromDoc,
  parseTopbarNotificationPrefs,
  topbarAllowsDoc,
  workspaceAllowsDoc,
};