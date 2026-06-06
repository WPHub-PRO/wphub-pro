/**
 * JWT actions: get_monitor, get_monitors, get_recent_incidents (UptimeRobot API via server key).
 *
 * Payload uses same JSON envelope as sync (`jwt`, `action`, …). Never expose UPTIME_ROBOT_API_KEY to client.
 */

const { Client, Account, Databases, Users } = await import('node-appwrite');
import {
  getAppwriteConnection,
  resolvedAppwriteApiKey,
  httpFromAppwriteError,
  WPHUB_APPWRITE_IDS,
  fail,
  ok,
  trimStr,
  parsePayload,
  resolveWorkspaceAuthContext,
  sessionCanAccessSiteDocument,
} from '@code045/wphubpro-shared';
import {
  sanitizeMonitor,
  extractMonitor,
  parseMonitorCustomFields,
  ownerIdForUptimeSiteRow,
  buildMonitorsCustomFieldQueryString,
  fetchMonitorById,
  fetchMonitorsWithQuery,
  fetchAccountIncidents,
  fetchIncidentsForMonitor,
  extractMonitorsList,
  extractIncidentsList,
  incidentRowMonitorId,
  incidentTimestampMs,
} from '../lib/uptimeRobot.ts';
import { debugLog } from '../lib/debug.ts';

/** Owner id for UR custom field filters when listing without a site row: active team id or user id. */
function ownerIdForSessionWorkspace(wsCtx) {
  if (wsCtx.mode === 'team' && wsCtx.rowTeamId) return trimStr(wsCtx.rowTeamId);
  return trimStr(wsCtx.authUserId);
}

function monitorMatchesSite(monitor, siteId, siteDoc) {
  const wantSite = trimStr(siteId);
  const wantOwner = ownerIdForUptimeSiteRow(siteDoc);
  const { siteId: sawSite, ownerId: sawOwner } = parseMonitorCustomFields(
    /** @type {Record<string, unknown>} */ (monitor),
  );
  if (!sawSite && !sawOwner) return true;
  return sawSite === wantSite && sawOwner === wantOwner;
}

function readUptimePayload(req) {
  if (
    req &&
    req._parsedPayload &&
    typeof req._parsedPayload === 'object' &&
    !Buffer.isBuffer(req._parsedPayload)
  ) {
    return req._parsedPayload;
  }
  return parsePayload(req);
}

/**
 * @param {{ req: any, res: any, log: (m: string) => void, error: (m: string) => void }} ctx
 */
export default async ({ req, res, log, error: logError }) => {
  try {
    const payload = readUptimePayload(req);
    const jwt = typeof payload.jwt === 'string' ? payload.jwt.trim() : '';
    const action = String(payload.action || '').toLowerCase().trim();
    const urKey = String(process.env.UPTIME_ROBOT_API_KEY || '').trim();
    const { endpoint, projectId } = getAppwriteConnection();
    const apiKey = resolvedAppwriteApiKey(req);
    const dbId = String(
      process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId,
    ).trim();
    const sitesCollection = WPHUB_APPWRITE_IDS.platformTables.sites;

    debugLog(log, 'readUptime entry action=', action, 'jwtLen=', jwt.length, 'payload keys=', Object.keys(payload || {}));

    if (!urKey) {
      debugLog(log, 'readUptime abort no UPTIME_ROBOT_API_KEY');
      return fail(res, 'UPTIME_ROBOT_API_KEY is not configured.', 500);
    }
    if (!endpoint || !projectId || !apiKey) {
      debugLog(log, 'readUptime abort Appwrite env');
      return fail(res, 'Appwrite env missing.', 500);
    }
    if (!jwt) {
      debugLog(log, 'readUptime abort no jwt');
      return fail(res, 'Authentication required (jwt).', 401);
    }

    const userClient = new Client().setEndpoint(endpoint).setProject(projectId).setJWT(jwt);
    const account = new Account(userClient);
    let user;
    try {
      user = await account.get();
    } catch (e) {
      logError(String(e && e.message ? e.message : e));
      debugLog(log, 'readUptime JWT account.get failed');
      return fail(res, 'Invalid or expired JWT.', 401);
    }

    const admin = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    const databases = new Databases(admin);
    const users = new Users(admin);

    const wsCtx = await resolveWorkspaceAuthContext(databases, user.$id, users);
    const ownerForList = ownerIdForSessionWorkspace(wsCtx);
    debugLog(log, 'workspace mode=', wsCtx.mode, 'ownerForList len=', ownerForList.length);

    if (action === 'get_monitor') {
      const siteId = typeof payload.siteId === 'string' ? payload.siteId.trim() : '';
      const monitorIdOpt =
        payload.monitorId != null ? String(payload.monitorId).trim() : '';
      const includeIncidents = payload.includeIncidents === true || payload.includeIncidents === 'true';
      const incidentsMaxAgeDays = Math.min(
        120,
        Math.max(1, Number(payload.incidentsMaxAgeDays) || 30),
      );

      debugLog(log, 'get_monitor siteId=', siteId, 'monitorIdOpt=', monitorIdOpt || '(from site)', 'includeIncidents=', includeIncidents);

      if (!siteId) {
        return fail(res, 'siteId is required.', 400);
      }

      let site;
      try {
        site = await databases.getDocument(dbId, sitesCollection, siteId);
      } catch (e) {
        const mapped = httpFromAppwriteError(e);
        if (mapped && mapped.status === 404) return fail(res, 'Site not found.', 404);
        throw e;
      }

      if (!sessionCanAccessSiteDocument(wsCtx, site, users)) {
        debugLog(log, 'get_monitor forbidden siteId=', siteId);
        return fail(res, 'Forbidden.', 403);
      }

      const mid =
        monitorIdOpt ||
        (site.ur_monitor_id != null ? String(site.ur_monitor_id).trim() : '') ||
        (site.urMonitorId != null ? String(site.urMonitorId).trim() : '');
      if (!mid || !/^\d+$/.test(mid)) {
        debugLog(log, 'get_monitor no linked monitor for siteId=', siteId);
        return ok(res, {
          success: true,
          monitor: null,
          incidents: [],
          message: 'No UptimeRobot monitor linked for this site.',
        });
      }

      const fetched = await fetchMonitorById(urKey, mid);
      debugLog(log, 'fetchMonitorById status=', fetched.status, 'ok=', fetched.ok);
      if (!fetched.ok) {
        const msg =
          fetched.data && typeof fetched.data === 'object' && 'message' in fetched.data
            ? String(/** @type {Record<string, unknown>} */ (fetched.data).message)
            : `UptimeRobot error (${fetched.status})`;
        return ok(res, { success: false, message: msg, monitor: null });
      }

      const mon = extractMonitor(fetched.data);
      if (mon && !monitorMatchesSite(mon, siteId, site)) {
        debugLog(log, 'get_monitor monitorMatchesSite=false mid=', mid);
        return fail(res, 'Monitor does not match this site.', 403);
      }

      let incidents = [];
      if (includeIncidents && mon) {
        const idStr = String(mon.id != null ? mon.id : mid);
        const incRes = await fetchIncidentsForMonitor(urKey, idStr, 50);
        debugLog(log, 'fetchIncidentsForMonitor status=', incRes.status, 'ok=', incRes.ok);
        if (incRes.ok) {
          const raw = extractIncidentsList(incRes.data);
          const cutoff = Date.now() - incidentsMaxAgeDays * 86400000;
          incidents = raw
            .filter((row) => incidentTimestampMs(row) >= cutoff)
            .sort((a, b) => incidentTimestampMs(b) - incidentTimestampMs(a));
        }
      }

      debugLog(log, 'get_monitor success incidents count=', incidents.length);
      return ok(res, {
        success: true,
        monitor: mon ? JSON.parse(sanitizeMonitor(mon)) : null,
        incidents,
      });
    }

    if (action === 'get_monitors') {
      /** @type {string[]} */
      const extraFilters = Array.isArray(payload.customFieldFilters)
        ? /** @type {string[]} */ (payload.customFieldFilters.map((x) => String(x)))
        : [];
      const pairs = [`ownerId:${ownerForList}`, ...extraFilters];
      const qs = buildMonitorsCustomFieldQueryString(pairs);
      const lim = Math.min(100, Math.max(1, Number(payload.limit) || 50));
      const fullQs = qs ? `${qs}&limit=${lim}` : `limit=${lim}`;
      debugLog(log, 'get_monitors fullQs=', fullQs);
      const result = await fetchMonitorsWithQuery(urKey, fullQs);
      debugLog(log, 'fetchMonitorsWithQuery status=', result.status, 'ok=', result.ok);
      if (!result.ok) {
        const msg =
          result.data && typeof result.data === 'object' && 'message' in result.data
            ? String(/** @type {Record<string, unknown>} */ (result.data).message)
            : `UptimeRobot error (${result.status})`;
        return fail(res, msg, result.status >= 400 ? result.status : 502);
      }
      const list = extractMonitorsList(result.data);
      const sanitized = list.map((m) => JSON.parse(sanitizeMonitor(m)));
      debugLog(log, 'get_monitors count=', sanitized.length);
      return ok(res, { success: true, monitors: sanitized });
    }

    if (action === 'get_recent_incidents') {
      const limit = Math.min(50, Math.max(1, Number(payload.limit) || 3));
      const maxAgeDays = Math.min(90, Math.max(1, Number(payload.maxAgeDays) || 7));
      const siteIdFilter = typeof payload.siteId === 'string' ? payload.siteId.trim() : '';

      const pairs = [`ownerId:${ownerForList}`];
      if (siteIdFilter) {
        pairs.push(`siteId:${siteIdFilter}`);
      }
      const qs = buildMonitorsCustomFieldQueryString(pairs);
      const fullQs = qs ? `${qs}&limit=30` : 'limit=30';
      debugLog(log, 'get_recent_incidents fullQs=', fullQs, 'siteIdFilter=', siteIdFilter || '(none)');
      const result = await fetchMonitorsWithQuery(urKey, fullQs);
      debugLog(log, 'fetchMonitorsWithQuery status=', result.status, 'ok=', result.ok);
      if (!result.ok) {
        const msg =
          result.data && typeof result.data === 'object' && 'message' in result.data
            ? String(/** @type {Record<string, unknown>} */ (result.data).message)
            : `UptimeRobot error (${result.status})`;
        return ok(res, { success: true, incidents: [], message: msg });
      }

      const monitors = extractMonitorsList(result.data).slice(0, 15);
      const idSet = new Set(
        monitors.map((m) => (m.id != null ? String(m.id) : '')).filter((x) => Boolean(trimStr(x))),
      );
      const cutoff = Date.now() - maxAgeDays * 86400000;

      const incRes = await fetchAccountIncidents(urKey);
      debugLog(log, 'fetchAccountIncidents status=', incRes.status, 'ok=', incRes.ok);
      if (!incRes.ok) {
        const msg =
          incRes.data && typeof incRes.data === 'object' && 'message' in incRes.data
            ? String(/** @type {Record<string, unknown>} */ (incRes.data).message)
            : `UptimeRobot error (${incRes.status})`;
        return ok(res, { success: true, incidents: [], message: msg });
      }

      const raw = extractIncidentsList(incRes.data);
      const sliced = raw
        .filter((row) => {
          const mid = incidentRowMonitorId(row);
          return Boolean(mid && idSet.has(mid) && incidentTimestampMs(row) >= cutoff);
        })
        .map((row) => {
          const mid = incidentRowMonitorId(row);
          return { ...row, _monitorId: mid };
        })
        .sort((a, b) => incidentTimestampMs(b) - incidentTimestampMs(a))
        .slice(0, limit);

      debugLog(log, 'get_recent_incidents merged count=', sliced.length);
      return ok(res, { success: true, incidents: sliced });
    }

    debugLog(log, 'readUptime unknown action=', action);
    return fail(res, 'Unknown read action.', 400);
  } catch (err) {
    const mapped = httpFromAppwriteError(err);
    if (mapped) {
      debugLog(log, 'readUptime Appwrite mapped', mapped.status, mapped.message);
      return fail(res, mapped.message, mapped.status);
    }
    debugLog(log, 'readUptime unhandled exception');
    logError(String(err && err.message ? err.message : err));
    return fail(res, 'Internal error', 500);
  }
};
