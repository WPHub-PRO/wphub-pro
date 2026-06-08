/**
 * Webhook: auth via header `UR-API-TOKEN` or JSON body `apiKey` (same secret as `UPTIME_ROBOT_API_KEY`).
 * Fetches monitor from UptimeRobot API, updates `monitor_meta`, sends in-app notification on UP/DOWN
 * transitions via `sendUserNotificationFromTemplate` (`site_uptime_up` / `site_uptime_down`).
 *
 * Env: UPTIME_ROBOT_API_KEY, standard Appwrite server vars. Verbose: DEBUG_UPTIME_ROBOT.
 * Monitors are provisioned with alert contact 8393043 (override: UPTIME_ROBOT_WEBHOOK_ALERT_CONTACT_ID).

 */

import * as crypto from 'node:crypto';
import {
  Client,
  Databases,
  Teams,
  Users,
  getAppwriteConnection,
  resolvedAppwriteApiKey,
  httpFromAppwriteError,
  WPHUB_APPWRITE_IDS,
  trimStr,
  platformDatabaseId,
  platformTeamsTableId,
  parseOptionalJsonObject,
  sendUserNotificationFromTemplate,
} from '@code045/wphubpro-shared';
import {
  mergeMonitorMeta,
  parseMonitorMeta,
  fetchMonitorById,
  extractMonitor,
  parseMonitorCustomFields,
  sanitizeMonitor,
  hubOperationalStatusFromUrMonitor,
  urMonitorStatusTitleLabel,
  clampUrHttpStatusForClient,
  urErrorMessageFromResponse,
} from '../lib/uptimeRobot.ts';
import { getHeader } from '../lib/httpHeaders.ts';
import { debugLog } from '../lib/debug.ts';

function safeEqualToken(a, b) {
  const ah = crypto.createHash('sha256').update(String(a ?? ''), 'utf8').digest();
  const bh = crypto.createHash('sha256').update(String(b ?? ''), 'utf8').digest();
  return crypto.timingSafeEqual(ah, bh);
}

function json(res, status, body) {
  const s = JSON.stringify(body);
  if (typeof res.json === 'function') return res.json(body, status);
  return res.send(s, status, { 'content-type': 'application/json; charset=utf-8' });
}

function parseIncomingBody(req) {
  if (req && req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = req && (req.bodyRaw !== undefined ? req.bodyRaw : req.body);
  if (typeof raw === 'object' && raw !== null && !Buffer.isBuffer(raw)) return raw;
  const s = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');
  if (!s.trim()) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function parseMonitorId(obj) {
  const pick =
    obj.monitorID ??
    obj.monitor_id ??
    obj.monitorId ??
    obj.id ??
    obj.monitor;
  const n = Number(pick);
  return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : '';
}

function siteTitleFromDoc(site) {
  const t = String(site.site_name || site.siteName || '').trim();
  return t.slice(0, 250) || 'Site';
}

/**
 * @param {'up' | 'down' | 'unknown'} op
 */
function notificationBodyForOperational(op) {
  if (op === 'up') return 'The monitor reports the site is up and reachable.';
  if (op === 'down') return 'The monitor reports the site is down or unreachable.';
  return 'Uptime Robot reported a status update for this site.';
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} ownerIdFromCf
 */
async function resolveRecipientUserId(databases, ownerIdFromCf) {
  const oid = trimStr(ownerIdFromCf);
  if (!oid) return '';
  const pdb = platformDatabaseId();
  const tid = platformTeamsTableId();
  try {
    const row = await databases.getDocument(pdb, tid, oid);
    const ou = trimStr(row.owner_id);
    if (ou) return ou;
  } catch {
    /* not a team id or missing */
  }
  return oid;
}

export default async ({ req, res, log, error: logError }) => {
  try {
    log('[uptime-robot] webhook entry');
    debugLog(log, 'webhook handler start');

    const expected = String(process.env.UPTIME_ROBOT_API_KEY || '').trim();
    if (!expected) {
      log('webhook abort UPTIME_ROBOT_API_KEY missing');
      return json(res, 500, { success: false, message: 'UPTIME_ROBOT_API_KEY is not configured.' });
    }

    const payload =
      req && req._parsedPayload && typeof req._parsedPayload === 'object'
        ? req._parsedPayload
        : parseIncomingBody(req);

    const headerToken = getHeader(req.headers, 'UR-API-TOKEN');
    const bodyApiKey = trimStr(payload.apiKey);
    debugLog(log, 'UR-API-TOKEN header length', headerToken.length);
    debugLog(log, 'body apiKey length', bodyApiKey.length);

    const authOk =
      (Boolean(headerToken) && safeEqualToken(headerToken, expected)) ||
      (Boolean(bodyApiKey) && safeEqualToken(bodyApiKey, expected));

    if (!authOk) {
      log('webhook unauthorized bad or missing UR-API-TOKEN / body apiKey');
      debugLog(log, 'webhook auth failed');
      return json(res, 401, { success: false, message: 'Unauthorized' });
    }
    debugLog(log, 'webhook auth ok');

    const { endpoint, projectId } = getAppwriteConnection();
    const apiKey = resolvedAppwriteApiKey(req);
    const dbId = String(
      process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId,
    ).trim();
    const sitesCollection = WPHUB_APPWRITE_IDS.platformTables.sites;

    if (!endpoint || !projectId || !apiKey) {
      log('webhook abort Appwrite env incomplete');
      return json(res, 500, { success: false, message: 'Appwrite env missing.' });
    }

    log('webhook payload keys', Object.keys(payload || {}).join(','));
    debugLog(log, 'parsed payload keys', Object.keys(payload || {}));

    const monitorId = parseMonitorId(payload);
    log(`[uptime-robot] webhook monitorId=${monitorId || '(missing)'}`);
    debugLog(log, 'parseMonitorId result', monitorId || '(empty)');
    if (!monitorId) {
      log('webhook abort no monitor id');
      debugLog(log, 'abort missing monitor id');
      return json(res, 400, { success: false, message: 'Missing monitor id in payload.' });
    }

    const urKey = expected;
    const fetched = await fetchMonitorById(urKey, monitorId);
    debugLog(log, 'fetchMonitorById status=', fetched.status, 'ok=', fetched.ok);

    if (!fetched.ok) {
      const msg = urErrorMessageFromResponse(fetched.data, `UptimeRobot error (${fetched.status})`);
      const httpStatus = clampUrHttpStatusForClient(fetched.status);
      return json(res, httpStatus, { success: false, message: msg });
    }

    const mon = extractMonitor(fetched.data);
    if (!mon || typeof mon !== 'object') {
      return json(res, 502, { success: false, message: 'Invalid monitor payload from UptimeRobot.' });
    }
    const { siteId: cfSiteId, ownerId: cfOwnerId } = parseMonitorCustomFields(
      /** @type {Record<string, unknown>} */ (mon),
    );
    debugLog(log, ' customFields siteId=', cfSiteId, 'ownerId=', cfOwnerId);

    if (!trimStr(cfSiteId) || !trimStr(cfOwnerId)) {
      log('[uptime-robot] webhook missing siteId or ownerId in monitor custom fields');
      return json(res, 400, {
        success: false,
        message: 'Monitor custom fields must include siteId and ownerId.',
      });
    }

    const admin = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    const databases = new Databases(admin);
    const teams = new Teams(admin);

    let site;
    try {
      site = await databases.getDocument(dbId, sitesCollection, trimStr(cfSiteId));
    } catch (e) {
      const mapped = httpFromAppwriteError(e);
      if (mapped && mapped.status === 404) {
        log(`[uptime-robot] webhook site not found ${cfSiteId}`);
        return json(res, 404, { success: false, message: 'Site not found.' });
      }
      throw e;
    }

    const recipientUserId = await resolveRecipientUserId(databases, cfOwnerId);
    if (!trimStr(recipientUserId)) {
      log('[uptime-robot] webhook could not resolve notification recipient');
      return json(res, 200, { success: true, ignored: true, reason: 'no_recipient' });
    }

    const siteMeta = parseOptionalJsonObject(site.meta_data || site.metaData || '', { enabled: true });
    const siteEnabled = siteMeta.enabled !== false;

    const op = hubOperationalStatusFromUrMonitor(/** @type {Record<string, unknown>} */ (mon));
    const statusLabel = urMonitorStatusTitleLabel(/** @type {Record<string, unknown>} */ (mon));
    const siteTitle = siteTitleFromDoc(site);
    const detailText = `${siteTitle} is ${statusLabel}. ${notificationBodyForOperational(op)}`;

    const iso = new Date().toISOString();
    const friendly =
      typeof mon.friendlyName === 'string' && mon.friendlyName.trim()
        ? String(mon.friendlyName).trim().slice(0, 500)
        : typeof mon.friendly_name === 'string' && mon.friendly_name.trim()
          ? String(mon.friendly_name).trim().slice(0, 500)
          : typeof mon.name === 'string' && mon.name.trim()
            ? String(mon.name).trim().slice(0, 500)
            : '';
    const urlHint =
      typeof mon.url === 'string' && mon.url.trim() ? String(mon.url).trim().slice(0, 500) : '';
    const detail = friendly || urlHint;

    const rawMeta =
      site.monitor_meta != null
        ? String(site.monitor_meta)
        : site.monitorMeta != null
          ? String(site.monitorMeta)
          : '';
    const prev = parseMonitorMeta(rawMeta);
    const prevDownSince =
      typeof prev.external_uptime_down_since === 'string' ? prev.external_uptime_down_since.trim() : '';
    const prevOpRaw = prev.external_uptime_status;
    const prevOp =
      typeof prevOpRaw === 'string' ? prevOpRaw.trim().toLowerCase() : String(prevOpRaw || '').trim().toLowerCase();

    /** @type {Record<string, unknown>} */
    const operational = {
      external_uptime_last_event_at: iso,
      external_uptime_status: op,
      ...(detail ? { external_uptime_last_event_detail: detail } : {}),
    };

    if (op === 'down') {
      if (!prevDownSince) operational.external_uptime_down_since = iso;
    } else if (op === 'up') {
      operational.external_uptime_down_since = '';
    }

    await databases.updateDocument(dbId, sitesCollection, site.$id, {
      monitor_meta: mergeMonitorMeta(rawMeta, {
        urSanitizedJson: sanitizeMonitor(/** @type {Record<string, unknown>} */ (mon)),
        operational,
      }),
    });

    if (!siteEnabled) {
      log(`[uptime-robot] webhook site disabled skip notify siteId=${site.$id}`);
      return json(res, 200, {
        success: true,
        siteId: site.$id,
        ignored: true,
        reason: 'site_disabled',
        notificationSkipped: true,
      });
    }

    let eventKey = '';
    if (op === 'down' && prevOp !== 'down') eventKey = 'site_uptime_down';
    else if (op === 'up' && prevOp !== 'up') eventKey = 'site_uptime_up';

    /** @type {{ ok: boolean; skipped?: string; reason?: string }} */
    let notify = { ok: false, skipped: 'no_transition' };
    if (eventKey) {
      const users = new Users(admin);
      const teamIdRow = trimStr(site.team_id ?? site.teamId);
      try {
        notify = await sendUserNotificationFromTemplate(databases, {
          eventKey,
          recipientUserId,
          users,
          teams,
          teamId: teamIdRow || null,
          payload: {
            site_name: siteTitle,
            site_url: String(site.site_url || site.siteUrl || '').slice(0, 512),
            site_id: site.$id,
            status_label: statusLabel,
            monitor_name: friendly,
            monitor_url: urlHint,
            detail: detailText,
            external_uptime_status: op,
          },
        });
        if (!notify.ok) {
          logError(
            `[uptime-robot] webhook notify failed event=${eventKey} reason=${String(notify.reason || notify.skipped || '')}`,
          );
        }
      } catch (e) {
        logError(String(e && e.message ? e.message : e));
        notify = { ok: false, reason: 'notify_error' };
      }
    }

    log(`[uptime-robot] webhook ok siteId=${site.$id} external_uptime_status=${op}`);
    debugLog(log, 'updateDocument monitor_meta ok siteId=', site.$id, 'eventKey=', eventKey || '(none)', 'notifyOk=', notify.ok);

    return json(res, 200, {
      success: true,
      siteId: site.$id,
      eventKey: eventKey || undefined,
      notificationSent: notify.ok === true,
      ...(notify.skipped ? { notificationSkipped: true } : {}),
    });
  } catch (err) {
    const mapped = httpFromAppwriteError(err);
    if (mapped) {
      debugLog(log, 'Appwrite error mapped status', mapped.status, mapped.message);
      return json(res, mapped.status, { success: false, message: mapped.message });
    }
    debugLog(log, 'webhook unhandled error');
    logError(String(err && err.message ? err.message : err));
    return json(res, 500, { success: false, message: 'Internal error' });
  }
};
