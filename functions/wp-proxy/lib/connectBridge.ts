import { WPHUB_APPWRITE_IDS, httpFromAppwriteError, activeSemverFromBridgePluginJson, isBridgeCredentialEnvelope, resolveOutboundBridgeSecret, Query } from '@code045/wphubpro-shared';
import { formatErrorForLog, redactBodyStringSnippet } from './logRedact.ts';

function databaseId() {
  return String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

function sitesCollectionId() {
  return WPHUB_APPWRITE_IDS.platformTables.sites;
}

function platformSettingsCollectionId() {
  return WPHUB_APPWRITE_IDS.platformTables.platformSettings;
}

/** @param {string} url */
function hostFromUrl(url) {
  try {
    return new URL(String(url || '')).host;
  } catch {
    return '';
  }
}

/** @param {string} url */
function redactUrlForLog(url) {
  if (!url || typeof url !== 'string') return url;
  try {
    const u = new URL(url);
    for (const k of ['bridge_secret', 'api_key', 'bridgeSecret', 'apiKey']) {
      if (u.searchParams.has(k)) u.searchParams.set(k, '[REDACTED]');
    }
    return u.toString();
  } catch {
    return url.replace(/([?&])(bridge_secret|api_key)=([^&]+)/gi, '$1$2=[REDACTED]');
  }
}

/** @param {string} bodyStr */
function redactRequestBodyForLog(bodyStr) {
  return redactBodyStringSnippet(bodyStr);
}

/**
 * @param {string} wpPath
 * @returns {string}
 */
function normalizeBridgePath(wpPath) {
  const raw = String(wpPath || '');
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  return decoded.replace(/^\/+/, '');
}

function zipPackageEndpointRejectsBase64(cleanedPath) {
  return (
    cleanedPath.includes('plugins/manage/update') ||
    cleanedPath.includes('plugins/manage/install-from-zip') ||
    cleanedPath.includes('themes/manage/install-from-zip') ||
    cleanedPath.includes('themes/manage/update')
  );
}

function hasNonEmptyZipBase64InBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const has = (v) => typeof v === 'string' && v.trim().length > 0;
  return has(body.zip_base64) || has(body.zipBase64);
}

function normalizeZipUrlAliases(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  const urlEmpty =
    body.zip_url === undefined || body.zip_url === null || (typeof body.zip_url === 'string' && !body.zip_url.trim());
  if (urlEmpty && typeof body.zipUrl === 'string' && body.zipUrl.trim()) {
    body.zip_url = body.zipUrl.trim();
  }
  delete body.zipUrl;
}

function omitZipBase64Deep(val) {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(omitZipBase64Deep);
  if (typeof val !== 'object') return val;
  const out = {};
  for (const [k, v] of Object.entries(val)) {
    if (k === 'zip_base64' || k === 'zipBase64') continue;
    out[k] = v !== null && typeof v === 'object' ? omitZipBase64Deep(v) : v;
  }
  return out;
}

/**
 * @param {object} args
 * @returns {Promise<{ ok: true, siteDocument: object, bridgeSecret: string, dbId: string, sitesColl: string } | { ok: false, statusCode: number, message: string }>}
 */
async function loadSiteForBridge({ databases, siteId, ENCRYPTION_KEY, error, log, blind }) {
  const dbId = databaseId();
  const sitesColl = sitesCollectionId();
  try {
    const siteDocument = await databases.getDocument(dbId, sitesColl, siteId);
    const site_url = siteDocument.site_url ?? siteDocument.siteUrl ?? '';
    if (!site_url || typeof site_url !== 'string') {
      return { ok: false, statusCode: 400, message: 'Site has no site_url.' };
    }

    let storedKey = siteDocument.api_key ?? siteDocument.apiKey ?? siteDocument.bridge_secret;
    if (siteDocument.data && typeof siteDocument.data === 'object') {
      storedKey = storedKey ?? siteDocument.data.api_key ?? siteDocument.data.apiKey ?? siteDocument.data.bridge_secret;
    }

    const looksEncrypted =
      storedKey && typeof storedKey === 'string' && isBridgeCredentialEnvelope(storedKey);
    if (storedKey && looksEncrypted) {
      if (!ENCRYPTION_KEY) {
        error('[wp-proxy] api_key is encrypted but ENCRYPTION_KEY is missing.');
        return {
          ok: false,
          statusCode: 500,
          message: 'Function misconfigured: ENCRYPTION_KEY required for encrypted site api_key.',
        };
      }
    }

    const bridgeSecret = resolveOutboundBridgeSecret(siteDocument, ENCRYPTION_KEY);
    if (storedKey && looksEncrypted && !blind && typeof log === 'function' && bridgeSecret) {
      log(`[wp-proxy] site ${siteId}: stored api_key decrypted successfully (secret redacted from logs).`);
    }
    if (storedKey && looksEncrypted && ENCRYPTION_KEY && !bridgeSecret) {
      error('[wp-proxy] api_key decrypt failed (wrong ENCRYPTION_KEY or corrupt value).');
      return {
        ok: false,
        statusCode: 500,
        message: 'Could not decrypt site API key. Check ENCRYPTION_KEY matches the Hub.',
      };
    }

    if (!bridgeSecret) {
      error('[wp-proxy] No bridge_secret/api_key for site.');
      return {
        ok: false,
        statusCode: 400,
        message: 'Site has no API key. Connect via WPHubPro Bridge first.',
      };
    }

    return { ok: true, siteDocument, bridgeSecret, dbId, sitesColl };
  } catch (e) {
    error(`[wp-proxy] load site: ${formatErrorForLog(e)}`);
    const mapped = httpFromAppwriteError(e);
    if (mapped) {
      return { ok: false, statusCode: mapped.status, message: mapped.message };
    }
    return { ok: false, statusCode: 500, message: e.message || 'Internal error' };
  }
}

/**
 * Hub → WordPress bridge REST (one request).
 *
 * @param {object} ctx
 * @param {object} opts
 * @param {string} opts.siteId
 * @param {string} opts.bridgePath e.g. `wphubpro/v1/plugins/manage/update`
 * @param {string} [opts.method='POST']
 * @param {Record<string, unknown>} [opts.body] JSON sent to WordPress (bridge_secret added server-side unless save-connection)
 * @param {string} [opts.wpAction]
 * @param {string} [opts.wpPlugin]
 * @param {boolean} [opts.blind]
 * @returns {Promise<{ ok: boolean, statusCode: number, message: string, responseData?: unknown, details?: object }>}
 */
async function callBridgeRest(ctx, opts) {
  const {
    log,
    error,
    databases,
    fetch,
    ENCRYPTION_KEY,
  } = ctx;
  const {
    siteId,
    bridgePath,
    method = 'POST',
    body = {},
    wpAction = '',
    wpPlugin = '',
    blind = false,
  } = opts;


  const loaded = await loadSiteForBridge({
    databases,
    siteId,
    ENCRYPTION_KEY,
    error,
    log,
    blind,
  });
  if (!loaded.ok) {
    return { ok: false, statusCode: loaded.statusCode, message: loaded.message };
  }
  const { siteDocument, bridgeSecret, dbId, sitesColl } = loaded;
  const site_url = siteDocument.site_url ?? siteDocument.siteUrl ?? '';

  const settingsColl = platformSettingsCollectionId();
  let bridgeLatestVersion = '';
  try {
    const settingsList = await databases.listDocuments(dbId, settingsColl, [
      Query.equal('key', 'bridge_plugin'),
      Query.limit(1),
    ]);
    if (settingsList.total > 0 && settingsList.documents[0]?.value) {
      const data = JSON.parse(settingsList.documents[0].value);
      const v = activeSemverFromBridgePluginJson(data);
      if (v) bridgeLatestVersion = v;
    }
  } catch (e) {
    log(`[wp-proxy] Could not fetch bridge_plugin: ${e.message}`);
  }


  const cleanedPath = normalizeBridgePath(bridgePath);
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-WPHub-Key': bridgeSecret,
    'X-WPHub-Action': wpAction || '',
    'X-WPHub-Plugin': wpPlugin || '',
    'User-Agent': 'WPHub-Proxy/1.0',
  };
  if (bridgeLatestVersion) {
    headers['X-WPHub-Bridge-Latest'] = bridgeLatestVersion;
  }
  const isManage =
    cleanedPath.includes('plugins/manage/') ||
    cleanedPath.includes('themes/manage/') ||
    cleanedPath.includes('hub/invoke');
  if (isManage) {
    const wpAdminLogin = (siteDocument.username || siteDocument.user_login || '').toString().trim();
    if (wpAdminLogin) {
      headers['X-WPHub-Admin-Login'] = wpAdminLogin;
    }
  }

  const proxyUrl = `${String(site_url).replace(/\/$/, '')}/wp-json/${cleanedPath}`;
  const fetchOptions = { method: String(method || 'POST').toUpperCase(), headers };


  if (['POST', 'PUT', 'PATCH'].includes(fetchOptions.method)) {
    let normalized =
      body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
    normalizeZipUrlAliases(normalized);
    if (zipPackageEndpointRejectsBase64(cleanedPath) && hasNonEmptyZipBase64InBody(normalized)) {
      return {
        ok: false,
        statusCode: 400,
        message:
          'zip_base64 / zipBase64 are not supported. Use zip_url (HTTPS) only; the WordPress site downloads the package.',
      };
    }

    delete normalized.handler;
    delete normalized.hubCallContext;
    delete normalized.hub_call_context;
    delete normalized.siteId;
    delete normalized.site_id;
    delete normalized.endpoint;
    delete normalized.method;

    if (cleanedPath.includes('save-connection')) {
      normalized.api_key = bridgeSecret;
      const wpAdminLogin = (siteDocument.username || siteDocument.user_login || '').toString().trim();
      if (wpAdminLogin) normalized.username = wpAdminLogin;
    } else {
      normalized.bridge_secret = bridgeSecret;
    }
    delete normalized.zip_base64;
    delete normalized.zipBase64;
    fetchOptions.body = JSON.stringify(normalized);
  }


  log(`[wp-proxy] Calling WP: ${fetchOptions.method} ${redactUrlForLog(proxyUrl)}`);

  const startMs = Date.now();
  let proxyResponse;
  try {
    proxyResponse = await fetch(proxyUrl, fetchOptions);
  } catch (e) {
    error(`[wp-proxy] WordPress fetch failed: ${formatErrorForLog(e)}`);
    error(
      `[wp-proxy] WP request meta: url=${redactUrlForLog(proxyUrl)} method=${fetchOptions.method} siteId=${String(siteId)} bridgePath=${String(bridgePath)}`,
    );
    if (fetchOptions.body && typeof fetchOptions.body === 'string') {
      error(`[wp-proxy] WP outbound JSON body (redacted): ${redactBodyStringSnippet(fetchOptions.body).slice(0, 6000)}`);
    }
    return {
      ok: false,
      statusCode: 502,
      message: e && e.message ? String(e.message) : 'Upstream WordPress request failed.',
    };
  }
  const responseText = await proxyResponse.text();
  const durationSec = (Date.now() - startMs) / 1000;

  if (blind) {
    if (!proxyResponse.ok) {
      error(
        `[wp-proxy] blind: WordPress HTTP ${proxyResponse.status} siteId=${String(siteId)} url=${redactUrlForLog(proxyUrl)}`,
      );
      error(`[wp-proxy] blind: response (truncated): ${String(responseText || '').slice(0, 4000)}`);
      if (fetchOptions.body && typeof fetchOptions.body === 'string') {
        error(
          `[wp-proxy] blind: outbound JSON (redacted): ${redactBodyStringSnippet(fetchOptions.body).slice(0, 4000)}`,
        );
      }
      log(`[wp-proxy] blind: WP ${proxyResponse.status} for site ${siteId}`);
    }
    return { ok: proxyResponse.ok, statusCode: proxyResponse.status, message: '' };
  }

  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = responseText;
  }

  const safeResponseData =
    responseData && typeof responseData === 'object' && !Array.isArray(responseData)
      ? omitZipBase64Deep(responseData)
      : responseData;

  if (!proxyResponse.ok) {
    const snippet = String(responseText || '').slice(0, 6000);
    error(`[wp-proxy] WordPress returned HTTP ${proxyResponse.status} for ${redactUrlForLog(proxyUrl)}`);
    error(`[wp-proxy] WP response body (truncated): ${snippet}`);
    if (fetchOptions.body && typeof fetchOptions.body === 'string') {
      error(`[wp-proxy] WP outbound JSON body (redacted): ${redactBodyStringSnippet(fetchOptions.body).slice(0, 6000)}`);
    }
    return {
      ok: false,
      statusCode: proxyResponse.status,
      message:
        safeResponseData && safeResponseData.message
          ? safeResponseData.message
          : `WP API Error: ${proxyResponse.status}`,
      details: { success: false, details: safeResponseData },
    };
  }


  try {
    const raw = siteDocument.log_data || siteDocument.incoming_log || '{}';
    let logData = { incoming: [], outgoing: [] };
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        logData.incoming = parsed;
      } else if (parsed && typeof parsed === 'object') {
        logData.incoming = Array.isArray(parsed.incoming) ? parsed.incoming : [];
        logData.outgoing = Array.isArray(parsed.outgoing) ? parsed.outgoing : [];
      }
    } catch {
      /* defaults */
    }
    const respPreview =
      typeof safeResponseData === 'object'
        ? JSON.stringify(safeResponseData).slice(0, 1500)
        : String(responseText || '').slice(0, 1500);
    let reqPreview = '';
    if (fetchOptions.body) {
      try {
        reqPreview = redactRequestBodyForLog(String(fetchOptions.body)).slice(0, 500);
      } catch {
        /* skip */
      }
    }
    logData.outgoing.push({
      time: new Date().toISOString(),
      method: fetchOptions.method,
      endpoint: bridgePath,
      statusCode: proxyResponse.status,
      duration: Math.round(durationSec * 100) / 100,
      request: reqPreview || undefined,
      response: respPreview || undefined,
    });
    if (logData.outgoing.length > 50) logData.outgoing = logData.outgoing.slice(-50);
    await databases.updateDocument(dbId, sitesColl, siteId, { log_data: JSON.stringify(logData) });
  } catch (logErr) {
    log(`[wp-proxy] Failed to update log_data: ${logErr.message}`);
  }

  return { ok: true, statusCode: proxyResponse.status, message: '', responseData: safeResponseData };
}

export {
  normalizeBridgePath,
  callBridgeRest,
  loadSiteForBridge,
  databaseId,
  sitesCollectionId,
};
