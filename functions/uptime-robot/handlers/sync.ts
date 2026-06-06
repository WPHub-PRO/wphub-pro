/**
 * Provisioning only: create/update/delete Uptime Robot monitors and persist `ur_monitor_id` +
 * `monitor_meta` (JSON: UR monitor snapshot + operational keys — skip reason, external uptime events).
 * Webhook merges alert fields into `monitor_meta`; no separate uptime columns.
 *
 * Env: APPWRITE_ENDPOINT, APPWRITE_DATABASE_ID, project id + API key (APPWRITE_PROJECT_ID /
 * APPWRITE_FUNCTION_PROJECT_ID, APPWRITE_API_KEY / APPWRITE_FUNCTION_API_KEY),
 * UPTIME_ROBOT_API_KEY, optional `UPTIME_ROBOT_WEBHOOK_ALERT_CONTACT_ID` (default 8393043 — WPHub webhook).
 * Table id: `sites` (same as `generated/appwrite` in the app).
 * Uptime Robot: REST API v3 — Bearer token auth. https://uptimerobot.com/api/v3/
 *
 * Verbose traces: set env `DEBUG_UPTIME_ROBOT` to `1`, `true`, or `yes` (logs prefixed `[uptime-robot:debug]`).
 *
 * Optional `monitor` object (merged with site defaults): friendlyName, url (site root override), timeout,
 * gracePeriod, … Monitor URL is always `{site}/wp-json/wphubpro/v1/heartbeat`; type HTTP; interval 60s;
 * keywordType ALERT_EXISTS; httpMethodType POST.
 */

const { Client, Account, Databases, Users } = await import('node-appwrite');
import {
  getAppwriteConnection,
  resolvedAppwriteApiKey,
  httpFromAppwriteError,
  WPHUB_APPWRITE_IDS,
  resolveWorkspaceAuthContext,
  parsePayload,
  parseOptionalJsonObject,
  sessionCanMutateSiteDocument,
} from '@code045/wphubpro-shared';
import {
  sanitizeMonitor,
  mergeMonitorMeta,
  getMonitorLimitState,
  isAtMonitorLimit,
  looksLikeMonitorLimitFailure,
  deleteMonitor,
  pauseMonitor,
  resumeMonitor,
  createMonitor,
  buildMonitorBody,
  patchMonitor,
  extractMonitor,
  fetchMonitorById,
  clampUrHttpStatusForClient,
  urErrorMessageFromResponse,
} from '../lib/uptimeRobot.ts';
import { debugLog } from '../lib/debug.ts';

function json(res, status, body) {
  if (typeof res.json === 'function') return res.json(body, status);
  return res.send(JSON.stringify(body), status, { 'content-type': 'application/json; charset=utf-8' });
}

function syncPayload(req) {
  if (req && req._parsedPayload && typeof req._parsedPayload === 'object' && !Buffer.isBuffer(req._parsedPayload)) {
    return req._parsedPayload;
  }
  return parsePayload(req);
}

/** @param {{ ok: boolean; status: number; data: unknown }} urResult */
function respondUrFailure(res, urResult, fallbackMsg) {
  const st = Number(urResult.status);
  let httpStatus = 502;
  if (Number.isFinite(st) && st >= 400 && st <= 599) {
    httpStatus = clampUrHttpStatusForClient(st);
  }
  const msg = urErrorMessageFromResponse(urResult.data, fallbackMsg);
  return json(res, httpStatus, { success: false, message: msg });
}

function parseSiteMeta(raw) {
  return parseOptionalJsonObject(raw, { enabled: true });
}

function normalizeUrl(siteUrl) {
  const t = String(siteUrl || '').trim();
  if (!t) return '';
  return t.startsWith('http://') || t.startsWith('https://') ? t.replace(/\/$/, '') : `https://${t.replace(/\/$/, '')}`;
}

/** Appended to the normalized site root for Uptime Robot HTTP checks. */
const WPHUB_HEARTBEAT_PATH = '/wp-json/wphubpro/v1/heartbeat';

/**
 * @param {string} baseNormalized Root URL without trailing slash (e.g. from `normalizeUrl`).
 * @returns {string}
 */
function siteUrlWithHeartbeat(baseNormalized) {
  const b = String(baseNormalized || '').trim().replace(/\/$/, '');
  if (!b) return '';
  if (b.endsWith(WPHUB_HEARTBEAT_PATH)) return b;
  return `${b}${WPHUB_HEARTBEAT_PATH}`;
}

/**
 * Merge site defaults with optional `payload.monitor` for Uptime Robot POST/PATCH /monitors.
 * `customFields` on the wire: `{ siteId, ownerId }` (see `buildUrCustomFieldsObject`).
 * @param {Record<string, unknown>} payload
 * @param {string} defaultFriendly
 * @param {string} defaultUrl
 * @param {Record<string, unknown>} siteDoc — full site row (`$id`, team_id, user_id)
 * @param {string} sessionUserId — JWT user id; fallback `ownerId` for personal sites without `user_id`
 * @returns {Record<string, unknown>}
 */
function mergeMonitorSpec(payload, defaultFriendly, defaultUrl, siteDoc, sessionUserId) {
  const raw =
    payload &&
    typeof payload.monitor === 'object' &&
    payload.monitor !== null &&
    !Array.isArray(payload.monitor)
      ? /** @type {Record<string, unknown>} */ (payload.monitor)
      : {};

  const friendlyName =
    typeof raw.friendlyName === 'string' && raw.friendlyName.trim()
      ? raw.friendlyName.trim()
      : defaultFriendly;

  let url = defaultUrl;
  if (typeof raw.url === 'string' && raw.url.trim()) {
    url = normalizeUrl(raw.url);
  }
  url = siteUrlWithHeartbeat(url);

  const siteRowId = String(siteDoc.$id || '').trim();

  /** @type {Record<string, unknown>} */
  const spec = {
    friendlyName,
    url,
    type: 'HTTP',
    siteIdForCustomFields: siteRowId,
    siteDocumentForOwner: siteDoc,
    fallbackOwnerUserId: sessionUserId,
  };

  if (raw.timeout !== undefined) spec.timeout = raw.timeout;
  if (raw.gracePeriod !== undefined) spec.gracePeriod = raw.gracePeriod;

  return spec;
}

function getUrMonitorId(site) {
  return site.ur_monitor_id != null ? String(site.ur_monitor_id).trim() : '';
}

/**
 * @param {{ req: any, res: any, log: (m: string) => void, error: (m: string) => void }} ctx
 */
export default async ({ req, res, log, error: logError }) => {
  try {
    const payload = syncPayload(req);
    const jwt = typeof payload.jwt === 'string' ? payload.jwt.trim() : '';
    const action = String(payload.action || '').toLowerCase().trim();
    const siteId = typeof payload.siteId === 'string' ? payload.siteId.trim() : '';

    debugLog(
      log,
      'sync entry bodySource=',
      req && req._parsedPayload ? '_parsedPayload' : 'raw',
      'jwtLen=',
      jwt.length,
      'hasMonitorOpt=',
      !!(payload && payload.monitor && typeof payload.monitor === 'object'),
    );
    log(`[uptime-robot] sync action=${action || '(missing)'} siteId=${siteId || '(missing)'}`);
    log('sync payload keys', Object.keys(payload || {}).join(','));
    debugLog(log, 'sync payload keys', Object.keys(payload || {}));

    if (!jwt || !siteId || !['ensure', 'delete', 'reconcile', 'pause', 'resume'].includes(action)) {
      log('sync abort invalid payload');
      debugLog(log, 'sync abort invalid payload');
      return json(res, 400, { success: false, message: 'Invalid payload (jwt, siteId, action).' });
    }

    const urKey = String(process.env.UPTIME_ROBOT_API_KEY || '').trim();
    const { endpoint, projectId } = getAppwriteConnection();
    const apiKey = resolvedAppwriteApiKey(req);
    const dbId = String(
      process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId,
    ).trim();
    const sitesCollection = WPHUB_APPWRITE_IDS.platformTables.sites;

    if (!urKey) {
      log('sync abort UPTIME_ROBOT_API_KEY missing');
      debugLog(log, 'sync abort no UR key');
      return json(res, 500, { success: false, message: 'UPTIME_ROBOT_API_KEY is not configured.' });
    }
    if (!endpoint || !projectId || !apiKey) {
      log('sync abort Appwrite env incomplete');
      debugLog(log, 'sync abort Appwrite env');
      return json(res, 500, { success: false, message: 'Appwrite env missing.' });
    }

    const userClient = new Client().setEndpoint(endpoint).setProject(projectId).setJWT(jwt);
    const account = new Account(userClient);
    let user;
    try {
      user = await account.get();
      log( 'sync jwt ok userId=', user.$id);
    } catch (e) {
      logError(String(e && e.message ? e.message : e));
      log('sync jwt invalid');
      debugLog(log, 'sync jwt invalid');
      return json(res, 401, { success: false, message: 'Invalid or expired JWT.' });
    }

    const admin = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
    const databases = new Databases(admin);
    const users = new Users(admin);

    let site;
    try {
      site = await databases.getDocument(dbId, sitesCollection, siteId);
    } catch (e) {
      const mapped = httpFromAppwriteError(e);
      if (mapped && mapped.status === 404) {
        log( 'sync site not found', siteId);
        return json(res, 404, { success: false, message: 'Site not found.' });
      }
      throw e;
    }

    const wsCtx = await resolveWorkspaceAuthContext(databases, user.$id, users);
    debugLog(
      log,
      'workspace mode=',
      wsCtx.mode,
      'rowTeamId=',
      wsCtx.rowTeamId || '',
      'authUserId=',
      wsCtx.authUserId,
    );
    if (!sessionCanMutateSiteDocument(wsCtx, site, users)) {
      log('sync forbidden userId=', user.$id, 'site team_id=', site.team_id, 'user_id=', site.user_id);
      debugLog(log, 'sync forbidden sessionCanMutateSiteDocument=false');
      return json(res, 403, { success: false, message: 'Forbidden.' });
    }

    const meta = parseSiteMeta(site.meta_data || site.metaData || '');
    const enabled = meta.enabled !== false;
    const bridgeOk = (site.bridge_status || site.bridgeStatus || '') === 'connected';
    const siteUrl = normalizeUrl(site.site_url || site.siteUrl);
    const friendlyName =
      String(site.site_name || site.siteName || 'Site').slice(0, 250) || 'WPHub site';

    const monitorSpec = mergeMonitorSpec(payload, friendlyName, siteUrl, site, user.$id);

    log('sync state enabled=', enabled, 'bridgeOk=', bridgeOk, 'hasUrl=', !!siteUrl, 'ur_monitor_id=', getUrMonitorId(site) || '(empty)');
    debugLog(log, 'sync state', { enabled, bridgeOk, hasUrl: !!siteUrl, urMid: getUrMonitorId(site) || '(empty)' });

    const clearUptimeFields = {
      ur_monitor_id: '',
      monitor_meta: '',
    };

    if (action === 'delete') {
      const mid = getUrMonitorId(site);
      log('sync path delete action=', action, 'monitorId=', mid || '(none)');
      debugLog(log, 'sync delete mid=', mid || '(none)');
      if (mid && /^\d+$/.test(mid)) {
        const dm = await deleteMonitor(urKey, mid);
        debugLog(log, 'deleteMonitor status=', dm.status, 'ok=', dm.ok);
        if (!dm.ok) {
          return respondUrFailure(res, dm, 'DELETE /monitors failed');
        }
      }
      await databases.updateDocument(dbId, sitesCollection, siteId, clearUptimeFields);
      debugLog(log, 'sync cleared ur_monitor_id + monitor_meta');
      return json(res, 200, { success: true, action: 'deleted' });
    }

    if (action === 'pause') {
      const mid = getUrMonitorId(site);
      if (!mid || !/^\d+$/.test(mid)) {
        log('sync pause skipped no_monitor');
        return json(res, 200, { success: true, skipped: true, reason: 'no_monitor' });
      }
      const pm = await pauseMonitor(urKey, mid);
      debugLog(log, 'pauseMonitor status=', pm.status, 'ok=', pm.ok);
      if (!pm.ok) {
        return respondUrFailure(res, pm, 'PATCH /monitors pause failed');
      }
      const iso = new Date().toISOString();
      const fetched = await fetchMonitorById(urKey, mid);
      const mon = fetched.ok ? extractMonitor(fetched.data) : null;
      await databases.updateDocument(dbId, sitesCollection, siteId, {
        monitor_meta: mergeMonitorMeta(site.monitor_meta || site.monitorMeta || '', {
          ...(mon ? { urSanitizedJson: sanitizeMonitor(mon) } : {}),
          operational: { site_disabled_at: iso },
        }),
      });
      return json(res, 200, { success: true, action: 'paused', monitorId: mid });
    }

    let resumeProvision = false;
    if (action === 'resume') {
      const mid = getUrMonitorId(site);
      if (mid && /^\d+$/.test(mid)) {
        const rm = await resumeMonitor(urKey, mid);
        debugLog(log, 'resumeMonitor status=', rm.status, 'ok=', rm.ok);
        if (!rm.ok) {
          return respondUrFailure(res, rm, 'PATCH /monitors resume failed');
        }
        const fetched = await fetchMonitorById(urKey, mid);
        const mon = fetched.ok ? extractMonitor(fetched.data) : null;
        await databases.updateDocument(dbId, sitesCollection, siteId, {
          monitor_meta: mergeMonitorMeta(site.monitor_meta || site.monitorMeta || '', {
            ...(mon ? { urSanitizedJson: sanitizeMonitor(mon) } : {}),
            operational: { site_disabled_at: '' },
          }),
        });
        return json(res, 200, { success: true, action: 'resumed', monitorId: mid });
      }
      resumeProvision = true;
    }

    const runProvisioning = action === 'reconcile' || action === 'ensure' || resumeProvision;
    if (!runProvisioning) {
      debugLog(log, 'sync unknown action branch');
      return json(res, 400, { success: false, message: 'Unknown action' });
    }

    if (!enabled) {
      log('sync skipped site_disabled action=', action);
      debugLog(log, 'sync skipped reason=site_disabled');
      return json(res, 200, {
        success: true,
        skipped: true,
        reason: 'site_disabled',
        message: 'Site is disabled; monitor left unchanged.',
      });
    }

    if (!bridgeOk || !siteUrl) {
      log('sync skipped not_ready bridgeOk=', bridgeOk, 'siteUrl empty=', !siteUrl);
      debugLog(log, 'sync skipped reason=not_ready');
      await databases.updateDocument(dbId, sitesCollection, siteId, {
        monitor_meta: mergeMonitorMeta(site.monitor_meta || site.monitorMeta || '', {
          operational: { uptime_robot_skip_reason: 'not_ready' },
        }),
      });
      return json(res, 200, {
        success: true,
        skipped: true,
        reason: 'not_ready',
        message: 'Site must be connected with a valid URL.',
      });
    }

    const existingId = getUrMonitorId(site);

    const limitState = await getMonitorLimitState(urKey);
    log('sync UR limits used=', limitState.used, 'limit=', limitState.limit, 'existingId=', existingId || '(none)');
    if (
      limitState.limit != null &&
      limitState.used != null &&
      isAtMonitorLimit(limitState.limit, limitState.used) &&
      !existingId
    ) {
      log('sync skipped monitor_limit');
      debugLog(log, 'sync skipped reason=monitor_limit');
      await databases.updateDocument(dbId, sitesCollection, siteId, {
        ur_monitor_id: '',
        monitor_meta: mergeMonitorMeta('', {
          operational: { uptime_robot_skip_reason: 'monitor_limit' },
        }),
      });
      return json(res, 200, {
        success: true,
        skipped: true,
        reason: 'monitor_limit',
        message: 'Uptime Robot monitor limit reached.',
      });
    }

    if (existingId && /^\d+$/.test(existingId)) {
      log('sync patch monitor', existingId);
      let ed;
      try {
        ed = await patchMonitor(urKey, existingId, monitorSpec);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log('sync patch validation', msg);
        debugLog(log, 'patchMonitor threw', msg);
        return json(res, 400, { success: false, message: msg });
      }
      const mon = extractMonitor(ed.data);
      log('sync patch result ok=', ed.ok, 'status=', ed.status);
      debugLog(log, 'patchMonitor UR http status=', ed.status, 'ok=', ed.ok, 'hasExtracted=', !!mon);
      if (ed.ok) {
        if (mon) {
          await databases.updateDocument(dbId, sitesCollection, siteId, {
            ur_monitor_id: String(mon.id != null ? mon.id : existingId),
            monitor_meta: mergeMonitorMeta(site.monitor_meta || site.monitorMeta || '', {
              urSanitizedJson: sanitizeMonitor(mon),
              operational: {
                uptime_robot_skip_reason: '',
                external_uptime_down_since: '',
                site_disabled_at: '',
              },
            }),
          });
        } else {
          await databases.updateDocument(dbId, sitesCollection, siteId, {
            ur_monitor_id: existingId,
            monitor_meta: mergeMonitorMeta(site.monitor_meta || site.monitorMeta || '', {
              operational: {
                uptime_robot_skip_reason: '',
                external_uptime_down_since: '',
                site_disabled_at: '',
              },
            }),
          });
        }
        const finalId = String(mon && mon.id != null ? mon.id : existingId);
        return json(res, 200, {
          success: true,
          action: resumeProvision ? 'resumed' : 'updated',
          monitorId: finalId,
        });
      }
      return respondUrFailure(res, ed, `PATCH /monitors failed (${ed.status})`);
    }

    log(
      'sync create monitor url=',
      String(monitorSpec.url || siteUrl || '').replace(/\?.*$/, ''),
      'type=',
      'HTTP',
    );
    let nm;
    try {
      debugLog(log, 'sync createMonitor body', buildMonitorBody(monitorSpec));
      nm = await createMonitor(urKey, monitorSpec);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log('sync create validation', msg);
      debugLog(log, 'createMonitor threw', msg);
      return json(res, 400, { success: false, message: msg });
    }
    const created = extractMonitor(nm.data);
    log('sync create result ok=', nm.ok, 'status=', nm.status);
    debugLog(log, 'createMonitor UR http status=', nm.status, 'ok=', nm.ok, 'hasExtracted=', !!created);
    if (nm.ok && created) {
      const newId = String(created.id);
      await databases.updateDocument(dbId, sitesCollection, siteId, {
        ur_monitor_id: newId,
        monitor_meta: mergeMonitorMeta(site.monitor_meta || site.monitorMeta || '', {
          urSanitizedJson: sanitizeMonitor(created),
          operational: {
            uptime_robot_skip_reason: '',
            external_uptime_down_since: '',
            site_disabled_at: '',
          },
        }),
      });
      return json(res, 200, {
        success: true,
        action: resumeProvision ? 'resumed' : 'created',
        monitorId: newId,
      });
    }

    if (looksLikeMonitorLimitFailure(nm)) {
      await databases.updateDocument(dbId, sitesCollection, siteId, {
        ur_monitor_id: '',
        monitor_meta: mergeMonitorMeta('', {
          operational: { uptime_robot_skip_reason: 'monitor_limit' },
        }),
      });
      const msg =
        nm.data && typeof nm.data === 'object' && 'message' in nm.data
          ? String(/** @type {Record<string, unknown>} */ (nm.data).message)
          : 'Monitor limit';
      return json(res, 200, {
        success: true,
        skipped: true,
        reason: 'monitor_limit',
        message: msg,
      });
    }

    return respondUrFailure(res, nm, `POST /monitors failed (${nm.status})`);
  } catch (err) {
    const mapped = httpFromAppwriteError(err);
    if (mapped) {
      debugLog(log, 'sync Appwrite mapped', mapped.status, mapped.message);
      return json(res, mapped.status, { success: false, message: mapped.message });
    }
    debugLog(log, 'sync unhandled exception');
    logError(String(err && err.message ? err.message : err));
    return json(res, 500, { success: false, message: 'Internal error' });
  }
};
