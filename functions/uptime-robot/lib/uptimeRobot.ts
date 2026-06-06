/**
 * Uptime Robot REST API v3 — JSON over HTTPS, Bearer token (API key).
 * @see https://uptimerobot.com/api/v3/
 */

const UR_V3_BASE = 'https://api.uptimerobot.com/v3';

import { trimStr } from '@code045/wphubpro-shared';

/** WPHub Appwrite webhook alert contact in UptimeRobot. Override with `UPTIME_ROBOT_WEBHOOK_ALERT_CONTACT_ID`. */
const DEFAULT_UPTIME_ROBOT_WEBHOOK_ALERT_CONTACT_ID = 8393043;

/**
 * `assignedAlertContacts` for POST/PATCH /monitors (WPHub webhook integration).
 * @returns {{ alertContactId: number, threshold: number, recurrence: number }[] | null}
 */
function webhookAssignedAlertContacts() {
  const raw = trimStr(process.env.UPTIME_ROBOT_WEBHOOK_ALERT_CONTACT_ID);
  const id = raw ? Number(raw) : DEFAULT_UPTIME_ROBOT_WEBHOOK_ALERT_CONTACT_ID;
  if (!Number.isFinite(id) || id <= 0) return null;
  return [
    {
      alertContactId: Math.floor(id),
      threshold: 0,
      recurrence: 0,
    },
  ];
}

/** UptimeRobot custom field limits (paid plans may be required for custom fields). */
const UR_CUSTOM_KEY_MAX = 64;
const UR_CUSTOM_VALUE_MAX = 255;
const UR_CUSTOM_MAX_KEYS = 20;

/** Fields we persist in monitor_meta (v3 names; friendly_name kept for older rows). */
const ALLOWED_MONITOR_KEYS = new Set([
  'id',
  'name',
  'friendly_name',
  'url',
  'type',
  'status',
  'interval',
  'tags',
  'currentStateDuration',
  'lastIncidentId',
  'customFields',
]);

/** Operational fields stored inside the same `monitor_meta` JSON blob (not separate columns). */
const META_OPER_KEYS = new Set([
  'uptime_robot_skip_reason',
  'external_uptime_baseline_at',
  'external_uptime_last_event_at',
  'external_uptime_status',
  'external_uptime_last_event_detail',
  /** ISO timestamp when UR first reported sustained down; cleared on up. Used for 1h auto-removal. */
  'external_uptime_down_since',
  /** ISO when the Hub user disabled the site (monitor paused, not deleted). */
  'site_disabled_at',
]);

/**
 * Sanitize custom field key: alphanumeric, underscore, hyphen; max 64 (UR rules).
 * @param {string} key
 */
function sanitizeUrCustomFieldKey(key) {
  const k = trimStr(key).slice(0, UR_CUSTOM_KEY_MAX);
  if (!k || !/^[a-zA-Z0-9_-]+$/.test(k)) return '';
  return k;
}

/**
 * Sanitize custom field value; max 255 chars.
 * @param {string | number | undefined} val
 */
function sanitizeUrCustomFieldValue(val) {
  let v = trimStr(val);
  if (v.length > UR_CUSTOM_VALUE_MAX) v = v.slice(0, UR_CUSTOM_VALUE_MAX);
  return v;
}

/**
 * Hub owner id for UR custom field `ownerId`: team document uses team_id; else site user_id.
 * @param {Record<string, unknown>} siteDoc
 */
function ownerIdForUptimeSiteRow(siteDoc) {
  const teamId = trimStr(siteDoc.team_id ?? siteDoc.teamId);
  if (teamId) return sanitizeUrCustomFieldValue(teamId);
  return sanitizeUrCustomFieldValue(siteDoc.user_id ?? siteDoc.userId ?? '');
}

/**
 * Request body `customFields` for UR v3 POST/PATCH `/monitors`: plain object
 * `{ siteId: "<sites row $id>", ownerId: "<team id or owner user id>" }`.
 *
 * @param {string} siteDocumentId — Appwrite sites row `$id`
 * @param {Record<string, unknown>} siteDoc
 * @param {string | undefined} [fallbackOwnerUserId] — JWT user id when personal site has no `user_id`
 * @returns {Record<string, string>}
 */
function buildUrCustomFieldsObject(siteDocumentId, siteDoc, fallbackOwnerUserId) {
  const sid = sanitizeUrCustomFieldValue(siteDocumentId);
  let oid = ownerIdForUptimeSiteRow(siteDoc);
  if (!oid && fallbackOwnerUserId) {
    const hasTeam = trimStr(siteDoc.team_id ?? siteDoc.teamId);
    if (!hasTeam) {
      oid = sanitizeUrCustomFieldValue(String(fallbackOwnerUserId));
    }
  }
  /** @type {Record<string, string>} */
  const out = {};
  if (sid) out.siteId = sid;
  if (oid) out.ownerId = oid;
  return out;
}

/**
 * Legacy array form `{ name, value }[]` — derived from {@link buildUrCustomFieldsObject}.
 * @deprecated Prefer {@link buildUrCustomFieldsObject} for POST/PATCH bodies.
 * @returns {{ name: string, value: string }[]}
 */
function buildUrCustomFieldsArray(siteDocumentId, siteDoc, fallbackOwnerUserId) {
  const o = buildUrCustomFieldsObject(siteDocumentId, siteDoc, fallbackOwnerUserId);
  const out = [];
  if (o.siteId) out.push({ name: 'siteId', value: o.siteId });
  if (o.ownerId) out.push({ name: 'ownerId', value: o.ownerId });
  return out.slice(0, UR_CUSTOM_MAX_KEYS);
}

/**
 * Split `key:value` on first colon only (value may contain ':').
 * Accepts optional `customField=` prefix.
 * @param {string} raw
 * @returns {{ key: string, value: string } | null}
 */
function parseCustomFieldPair(raw) {
  let s = trimStr(raw);
  if (!s) return null;
  if (s.toLowerCase().startsWith('customfield=')) {
    const eq = s.indexOf('=');
    s = s.slice(eq + 1);
  }
  const colon = s.indexOf(':');
  if (colon <= 0) return null;
  const key = sanitizeUrCustomFieldKey(s.slice(0, colon));
  const value = sanitizeUrCustomFieldValue(s.slice(colon + 1));
  if (!key || !value) return null;
  return { key, value };
}

/**
 * Build query string for GET /monitors: repeated `customField=key:value` (AND semantics per UR).
 * @param {string[]} pairs — each `key:value` or `customField=key:value`
 */
function buildMonitorsCustomFieldQueryString(pairs) {
  const params = new URLSearchParams();
  for (const raw of pairs || []) {
    const p = parseCustomFieldPair(typeof raw === 'string' ? raw : '');
    if (!p) continue;
    params.append('customField', `${p.key}:${p.value}`);
  }
  return params.toString();
}

/**
 * @param {string | undefined} raw
 * @returns {Record<string, unknown>}
 */
function parseMonitorMeta(raw) {
  if (!raw || typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const o = JSON.parse(raw);
    return typeof o === 'object' && o !== null ? /** @type {Record<string, unknown>} */ (o) : {};
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, unknown>} obj
 * @returns {string}
 */
function serializeMonitorMeta(obj) {
  const MAX = 12000;
  let json = JSON.stringify(obj);
  if (json.length <= MAX) return json;
  const o = { ...obj };
  if (typeof o.external_uptime_last_event_detail === 'string' && o.external_uptime_last_event_detail.length > 800) {
    o.external_uptime_last_event_detail = `${o.external_uptime_last_event_detail.slice(0, 797)}...`;
    json = JSON.stringify(o);
  }
  if (json.length <= MAX) return json;
  /** @type {Record<string, unknown>} */
  const urMini = {};
  for (const k of ALLOWED_MONITOR_KEYS) {
    if (Object.prototype.hasOwnProperty.call(o, k)) urMini[k] = o[k];
  }
  /** @type {Record<string, unknown>} */
  const keep = {};
  for (const k of META_OPER_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
    const v = o[k];
    if (v != null && v !== '') keep[k] = v;
  }
  return JSON.stringify({ ...keep, ...urMini });
}

/**
 * Merge a sanitized UR monitor JSON string and/or operational key updates into existing `monitor_meta`.
 * @param {string | undefined} existingRaw
 * @param {{ urSanitizedJson?: string, operational?: Record<string, unknown> } | undefined} parts
 * @returns {string}
 */
function mergeMonitorMeta(existingRaw, parts) {
  const o = parseMonitorMeta(existingRaw);
  if (parts && parts.urSanitizedJson) {
    let ur;
    try {
      ur = JSON.parse(parts.urSanitizedJson);
    } catch {
      ur = {};
    }
    if (typeof ur !== 'object' || ur === null) ur = {};
    const urObj = /** @type {Record<string, unknown>} */ (ur);
    for (const k of ALLOWED_MONITOR_KEYS) {
      if (Object.prototype.hasOwnProperty.call(urObj, k)) o[k] = urObj[k];
    }
  }
  if (parts && parts.operational && typeof parts.operational === 'object') {
    const op = /** @type {Record<string, unknown>} */ (parts.operational);
    for (const k of Object.keys(op)) {
      if (!META_OPER_KEYS.has(k)) continue;
      const v = op[k];
      if (v === '' || v === null || v === undefined) delete o[k];
      else o[k] = v;
    }
  }
  return serializeMonitorMeta(o);
}

/**
 * @param {string} apiKey
 * @returns {Record<string, string>}
 */
function bearerHeaders(apiKey) {
  return {
    Authorization: `Bearer ${String(apiKey).trim()}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

/**
 * @param {string} apiKey
 * @param {string} method
 * @param {string} path Absolute path e.g. /user/me or /monitors/1
 * @param {Record<string, unknown> | undefined} [jsonBody]
 */
async function urV3Fetch(apiKey, method, path, jsonBody) {
  const url = `${UR_V3_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  /** @type {RequestInit} */
  const init = {
    method,
    headers: bearerHeaders(apiKey),
  };
  if (jsonBody != null && method !== 'GET' && method !== 'DELETE') {
    init.body = JSON.stringify(jsonBody);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { _parseError: true, _raw: text };
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * @param {unknown} data
 * @returns {Record<string, unknown> | null}
 */
function extractMonitor(data) {
  if (!data || typeof data !== 'object') return null;
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.monitor && typeof d.monitor === 'object') return /** @type {Record<string, unknown>} */ (d.monitor);
  if (d.data && typeof d.data === 'object') {
    const inner = /** @type {Record<string, unknown>} */ (d.data);
    if (inner.monitor && typeof inner.monitor === 'object') {
      return /** @type {Record<string, unknown>} */ (inner.monitor);
    }
    if (typeof inner.id === 'number' || typeof inner.id === 'string') return inner;
  }
  if (typeof d.id === 'number' || typeof d.id === 'string') return d;
  return null;
}

/** @param {Record<string, unknown>} m */
function sanitizeMonitor(m) {
  if (!m || typeof m !== 'object') return '{}';
  /** @type {Record<string, number|string|boolean>} */
  const out = {};
  for (const k of ALLOWED_MONITOR_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(m, k)) continue;
    const v = m[k];
    if (v === null || v === undefined) continue;
    if (k === 'customFields') {
      try {
        out[k] = typeof v === 'string' ? v : JSON.stringify(v).slice(0, 4000);
      } catch {
        out[k] = '';
      }
      continue;
    }
    if (Array.isArray(v) && k === 'tags') {
      out[k] = JSON.stringify(v.slice(0, 30));
      continue;
    }
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
    } else if (typeof v === 'boolean') {
      out[k] = v;
    } else if (typeof v === 'string') {
      const t = v.length > 2000 ? `${v.slice(0, 1997)}...` : v;
      out[k] = t;
    }
  }
  if (out.name && !out.friendly_name) out.friendly_name = String(out.name);
  let json = JSON.stringify(out);
  const MAX = 8192;
  if (json.length > MAX) {
    const mini = {
      id: out.id,
      name: out.name,
      friendly_name: out.friendly_name,
      url: out.url,
      type: out.type,
      status: out.status,
    };
    json = JSON.stringify(mini);
    if (json.length > MAX) json = JSON.stringify({ id: out.id, _truncated: true });
  }
  return json;
}

/**
 * GET /user/me and GET /monitors?limit=1 — derive limit and current monitor count.
 * @param {string} apiKey
 */
async function getMonitorLimitState(apiKey) {
  const me = await urV3Fetch(apiKey, 'GET', '/user/me');
  const list = await urV3Fetch(apiKey, 'GET', '/monitors?limit=1');

  const d = me.data && typeof me.data === 'object' ? /** @type {Record<string, unknown>} */ (me.data) : {};
  const sub = d.subscription && typeof d.subscription === 'object' ? /** @type {Record<string, unknown>} */ (d.subscription) : {};

  let limit =
    numOrNull(d.monitorLimit) ??
    numOrNull(d.monitor_limit) ??
    numOrNull(sub.monitorLimit) ??
    numOrNull(sub.maxMonitors);

  const ld = list.data && typeof list.data === 'object' ? /** @type {Record<string, unknown>} */ (list.data) : {};
  let used =
    numOrNull(ld.totalCount) ??
    numOrNull(ld.total) ??
    numOrNull(d.monitorCount) ??
    numOrNull(d.activeMonitors);

  if (used == null && Array.isArray(ld.monitors) && typeof ld.totalCount === 'number') {
    used = ld.totalCount;
  }

  return {
    ok: me.ok && list.ok,
    status: !me.ok ? me.status : !list.ok ? list.status : 200,
    limit,
    used,
    rawMe: me.data,
    rawList: list.data,
  };
}

/** @param {unknown} v */
function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function isAtMonitorLimit(limit, used) {
  if (limit == null || used == null) return false;
  if (limit <= 0) return false;
  return used >= limit;
}

/**
 * @param {{ ok: boolean, status: number, data: unknown }} result
 */
function looksLikeMonitorLimitFailure(result) {
  if (result.status === 429) return true;
  const d = result.data;
  if (!d || typeof d !== 'object') return false;
  const msg = String(/** @type {Record<string, unknown>} */ (d).message || '').toLowerCase();
  const code = String(/** @type {Record<string, unknown>} */ (d).code || '');
  if (msg.includes('limit') || msg.includes('maximum') || msg.includes('exceeded')) return true;
  if (msg.includes('monitor') && (msg.includes('reach') || msg.includes('quota'))) return true;
  if (code && code.includes('limit')) return true;
  return false;
}

/**
 * @param {string} apiKey
 * @param {string} monitorId
 */
async function deleteMonitor(apiKey, monitorId) {
  const path = `/monitors/${encodeURIComponent(monitorId)}`;
  return urV3Fetch(apiKey, 'DELETE', path);
}

/**
 * Pause monitor (UR status 0).
 * @param {string} apiKey
 * @param {string} monitorId
 */
async function pauseMonitor(apiKey, monitorId) {
  const path = `/monitors/${encodeURIComponent(monitorId)}`;
  return urV3Fetch(apiKey, 'PATCH', path, { status: 0 });
}

/**
 * Resume / start monitor checks (UR status 1 = not checked yet, then UR schedules checks).
 * @param {string} apiKey
 * @param {string} monitorId
 */
async function resumeMonitor(apiKey, monitorId) {
  const path = `/monitors/${encodeURIComponent(monitorId)}`;
  return urV3Fetch(apiKey, 'PATCH', path, { status: 1 });
}

/**
 * Builds POST/PATCH /monitors JSON (camelCase). Provisioning always uses `type: HTTP`, `interval: 60`,
 * `keywordType: ALERT_EXISTS`, `httpMethodType: GET`, and `assignedAlertContacts` for the WPHub webhook.
 * @param {Record<string, unknown>} opts
 * @returns {Record<string, unknown>}
 */
function buildMonitorBody(opts) {
  const type = 'HTTP';
  const httpMethodType = 'GET';
  const keywordType = 'ALERT_EXISTS';
  const interval = 60;
  const timeout = 60;
  const checkSSLErrors = true;
  const sslExpirationReminder = true;
  const domainExpirationReminder = true;

  const friendlyName = String(opts.friendlyName ?? '').trim().slice(0, 250);
  if (!friendlyName) {
    throw new Error('friendlyName is required (max 250 characters).');
  }

  let rawUrl = opts.url != null ? String(opts.url).trim() : '';
  if (rawUrl.length > 10000) rawUrl = rawUrl.slice(0, 10000);

  if (!rawUrl) {
    throw new Error('url is required (max 10000 characters).');
  }

  /** @type {Record<string, unknown>} */
  const body = {
    type: type,
    friendlyName: friendlyName,
    interval: interval,
    url: rawUrl,
    keywordType: keywordType,
    httpMethodType: httpMethodType,
    timeout: timeout,
    checkSSLErrors: checkSSLErrors,
    sslExpirationReminder: sslExpirationReminder,
    domainExpirationReminder: domainExpirationReminder,
  };

  if (opts.timeout !== undefined && opts.timeout !== null && opts.timeout !== '') {
    const t = Number(opts.timeout);
    if (!Number.isFinite(t) || t < 0 || t > 60) {
      throw new Error('timeout must be between 0 and 60 seconds for HTTP monitors.');
    }
    body.timeout = Math.round(t);
  }

  if (opts.gracePeriod !== undefined && opts.gracePeriod !== null && opts.gracePeriod !== '') {
    const g = Number(opts.gracePeriod);
    if (!Number.isFinite(g) || g < 0) {
      throw new Error('gracePeriod must be a non-negative number.');
    }
    body.gracePeriod = Math.round(g);
  }

  const siteRowId = opts.siteIdForCustomFields != null ? String(opts.siteIdForCustomFields).trim() : '';
  const siteDoc = opts.siteDocumentForOwner;
  const fallbackOwner =
    opts.fallbackOwnerUserId != null && String(opts.fallbackOwnerUserId).trim()
      ? String(opts.fallbackOwnerUserId).trim()
      : undefined;
  if (siteRowId && siteDoc && typeof siteDoc === 'object') {
    const cf = buildUrCustomFieldsObject(
      siteRowId,
      /** @type {Record<string, unknown>} */ (siteDoc),
      fallbackOwner,
    );
    if (!cf.siteId || !cf.ownerId) {
      throw new Error(
        'UptimeRobot monitor requires customFields { siteId, ownerId } (set site team_id/user_id, or use a personal site with owner).',
      );
    }
    body.customFields = cf;
  }
  const alertContacts = webhookAssignedAlertContacts();
  if (alertContacts) {
    body.assignedAlertContacts = alertContacts;
  }

  return body;
}

/**
 * @param {string} apiKey
 * @param {Record<string, unknown>} opts
 */
async function createMonitor(apiKey, opts) {
  const body = buildMonitorBody(opts);
  return urV3Fetch(apiKey, 'POST', '/monitors', body);
}

/**
 * @param {string} apiKey
 * @param {string} monitorId
 * @param {Record<string, unknown>} opts
 */
async function patchMonitor(apiKey, monitorId, opts) {
  const body = buildMonitorBody(opts);
  const path = `/monitors/${encodeURIComponent(monitorId)}`;
  return urV3Fetch(apiKey, 'PATCH', path, body);
}

/**
 * @param {string} apiKey
 * @param {string} monitorId
 */
async function fetchMonitorById(apiKey, monitorId) {
  return urV3Fetch(apiKey, 'GET', `/monitors/${encodeURIComponent(monitorId)}`);
}

/**
 * @param {string} apiKey
 * @param {string} queryWithoutLeadingQuestion e.g. `customField=ownerId:x&limit=50`
 */
async function fetchMonitorsWithQuery(apiKey, queryWithoutLeadingQuestion) {
  const q = queryWithoutLeadingQuestion && String(queryWithoutLeadingQuestion).trim()
    ? `?${String(queryWithoutLeadingQuestion).replace(/^\?/, '')}`
    : '';
  return urV3Fetch(apiKey, 'GET', `/monitors${q}`);
}

/**
 * UptimeRobot v3: `GET /incidents` returns `{ data: Incident[] }` (no per-monitor path).
 * @param {string} apiKey
 */
async function fetchAccountIncidents(apiKey) {
  return urV3Fetch(apiKey, 'GET', '/incidents');
}

/**
 * Monitor id from a v3 incident row (`row.monitor.id`).
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {string}
 */
function incidentRowMonitorId(row) {
  if (!row || typeof row !== 'object') return '';
  const m = row.monitor;
  if (!m || typeof m !== 'object') return '';
  const id = /** @type {Record<string, unknown>} */ (m).id;
  return id != null ? String(id) : '';
}

/**
 * @param {string} apiKey
 * @param {string} monitorId
 * @param {number} [limit]
 */
async function fetchIncidentsForMonitor(apiKey, monitorId, limit) {
  const res = await fetchAccountIncidents(apiKey);
  if (!res.ok) return res;
  const lim = Number(limit) > 0 ? Math.min(Math.floor(Number(limit)), 50) : 25;
  const want = String(monitorId || '').trim();
  const all = extractIncidentsList(res.data);
  const filtered = all
    .filter((row) => {
      const mid = incidentRowMonitorId(row);
      return mid === want || (want && String(Number(mid)) === String(Number(want)));
    })
    .sort((a, b) => incidentTimestampMs(b) - incidentTimestampMs(a))
    .slice(0, lim);
  return { ok: true, status: 200, data: { incidents: filtered } };
}

/**
 * @param {unknown} data
 * @returns {Record<string, unknown>[]}
 */
function extractMonitorsList(data) {
  if (!data || typeof data !== 'object') return [];
  const d = /** @type {Record<string, unknown>} */ (data);
  if (Array.isArray(d.monitors)) return /** @type {Record<string, unknown>} */ (d.monitors);
  if (Array.isArray(d.data)) {
    const arr = /** @type {Record<string, unknown>} */ (d.data);
    if (arr.length === 0) return [];
    const first = arr[0];
    if (first && typeof first === 'object' && incidentRowMonitorId(first)) return [];
    return arr;
  }
  if (d.data && typeof d.data === 'object') {
    const inner = /** @type {Record<string, unknown>} */ (d.data);
    if (Array.isArray(inner.monitors)) return /** @type {Record<string, unknown>} */ (inner.monitors);
  }
  return [];
}

/**
 * @param {unknown} data
 * @returns {Record<string, unknown>[]}
 */
function extractIncidentsList(data) {
  if (!data || typeof data !== 'object') return [];
  const d = /** @type {Record<string, unknown>} */ (data);
  if (Array.isArray(d.incidents)) return /** @type {Record<string, unknown>} */ (d.incidents);
  if (Array.isArray(d.data)) {
    const arr = /** @type {Record<string, unknown>} */ (d.data);
    if (arr.length === 0) return [];
    const first = arr[0];
    if (first && typeof first === 'object' && incidentRowMonitorId(first)) {
      return arr;
    }
    return [];
  }
  if (d.data && typeof d.data === 'object') {
    const inner = /** @type {Record<string, unknown>} */ (d.data);
    if (Array.isArray(inner.incidents)) return /** @type {Record<string, unknown>} */ (inner.incidents);
  }
  return [];
}

/**
 * Best-effort ISO timestamp for sorting/filtering incidents.
 * @param {Record<string, unknown>} inc
 */
function incidentTimestampMs(inc) {
  const pick =
    inc.startedAt ??
    inc.started_at ??
    inc.createdAt ??
    inc.created_at ??
    inc.date ??
    inc.time;
  const s = pick != null ? String(pick) : '';
  const t = s ? Date.parse(s) : NaN;
  return Number.isFinite(t) ? t : 0;
}

/**
 * `siteId` / `ownerId` from UR monitor `customFields` (object `{ siteId, ownerId }` or array of `{ name, value }`).
 * @param {Record<string, unknown> | null | undefined} monitor
 * @returns {{ siteId: string; ownerId: string }}
 */
function parseMonitorCustomFields(monitor) {
  let siteId = '';
  let ownerId = '';
  if (!monitor || typeof monitor !== 'object') return { siteId, ownerId };
  let cf = monitor.customFields;
  if (typeof cf === 'string') {
    try {
      cf = JSON.parse(cf);
    } catch {
      cf = null;
    }
  }
  if (!Array.isArray(cf) && cf && typeof cf === 'object') {
    siteId = trimStr(/** @type {Record<string, unknown>} */ (cf).siteId);
    ownerId = trimStr(/** @type {Record<string, unknown>} */ (cf).ownerId);
  } else if (Array.isArray(cf)) {
    for (const row of cf) {
      if (!row || typeof row !== 'object') continue;
      const name = trimStr(row.name ?? row.key ?? row.id);
      const value = trimStr(row.value);
      if (name === 'siteId') siteId = value;
      if (name === 'ownerId') ownerId = value;
    }
  }
  return { siteId, ownerId };
}

/**
 * Hub tokens stored in `monitor_meta` operational keys (aligned with webhook legacy).
 * UR v3 status: 0 paused, 1 not checked, 2 up, 8 seems down, 9 down (legacy v2 mapping).
 * @param {Record<string, unknown> | null | undefined} monitor
 * @returns {'up' | 'down' | 'unknown'}
 */
function hubOperationalStatusFromUrMonitor(monitor) {
  if (!monitor || typeof monitor !== 'object') return 'unknown';
  const st = monitor.status;
  const n = Number(st);
  if (Number.isFinite(n)) {
    if (n === 2) return 'up';
    if (n === 9 || n === 8) return 'down';
    return 'unknown';
  }
  const s = String(st ?? '').toLowerCase();
  if (s.includes('pause')) return 'unknown';
  if (s.includes('up')) return 'up';
  if (s.includes('down')) return 'down';
  return 'unknown';
}

/**
 * Short English label for notifications / titles (not the numeric code).
 * @param {Record<string, unknown> | null | undefined} monitor
 */
function urMonitorStatusTitleLabel(monitor) {
  if (!monitor || typeof monitor !== 'object') return 'unknown';
  const st = monitor.status;
  const n = Number(st);
  if (Number.isFinite(n)) {
    if (n === 2) return 'up';
    if (n === 9) return 'down';
    if (n === 8) return 'down';
    if (n === 0) return 'paused';
    if (n === 1) return 'pending';
  }
  const s = String(st ?? '').trim();
  return s.length ? s.slice(0, 80) : 'unknown';
}

/**
 * Propagate UptimeRobot HTTP errors to the client (4xx/5xx only).
 * @param {number} status
 */
function clampUrHttpStatusForClient(status) {
  const s = Number(status);
  if (!Number.isFinite(s)) return 502;
  if (s >= 400 && s <= 599) return Math.min(599, Math.max(400, Math.floor(s)));
  return 502;
}

/**
 * @param {unknown} data — UR JSON body
 * @param {string} fallback
 */
function urErrorMessageFromResponse(data, fallback) {
  if (data && typeof data === 'object' && 'message' in /** @type {Record<string, unknown>} */ (data)) {
    const m = String(/** @type {Record<string, unknown>} */ (data).message);
    if (m.trim()) return m.trim().slice(0, 500);
  }
  return fallback;
}

export {
  UR_V3_BASE,
  sanitizeMonitor,
  parseMonitorMeta,
  serializeMonitorMeta,
  mergeMonitorMeta,
  getMonitorLimitState,
  isAtMonitorLimit,
  looksLikeMonitorLimitFailure,
  deleteMonitor,
  pauseMonitor,
  resumeMonitor,
  buildMonitorBody,
  createMonitor,
  patchMonitor,
  extractMonitor,
  urV3Fetch,
  ownerIdForUptimeSiteRow,
  buildUrCustomFieldsObject,
  buildUrCustomFieldsArray,
  buildMonitorsCustomFieldQueryString,
  parseCustomFieldPair,
  fetchMonitorById,
  fetchMonitorsWithQuery,
  fetchAccountIncidents,
  fetchIncidentsForMonitor,
  extractMonitorsList,
  extractIncidentsList,
  incidentRowMonitorId,
  incidentTimestampMs,
  parseMonitorCustomFields,
  hubOperationalStatusFromUrMonitor,
  urMonitorStatusTitleLabel,
  clampUrHttpStatusForClient,
  urErrorMessageFromResponse,
};