/**
 * PageSpeed via Google PageSpeed Insights API v5 (set GOOGLE_PAGESPEED_API_KEY on sites).
 */
import { ok, fail, resolveWorkspaceContext, sessionCanMutateSiteDocument, WPHUB_APPWRITE_IDS, appwriteDatabaseId, appwriteEndpoint, appwriteProjectId } from '@code045/wphubpro-shared';
import { verifyJwtUser } from '../lib/jwt.ts';
import { resolvePagespeedInsightsApiKey } from '../lib/googleApiKeys.ts';

const PAGESPEED_MIN_INTERVAL_MS = Number(
  process.env.SITES_PAGESPEED_MIN_MS || process.env.MANAGE_SITES_PAGESPEED_MIN_MS || 45_000,
);

function mergePerformanceMeta(existingRaw, strategy, slice) {
  let root = {};
  if (existingRaw && typeof existingRaw === 'string' && existingRaw.trim()) {
    try {
      const p = JSON.parse(existingRaw);
      if (p && typeof p === 'object' && !Array.isArray(p)) root = p;
    } catch {
      root = {};
    }
  }
  const now = new Date().toISOString();
  root[strategy] = {
    success: true,
    scores: slice.scores,
    coreWebVitals: slice.coreWebVitals,
    analyzedUrl: slice.analyzedUrl,
    lighthouseVersion: slice.lighthouseVersion,
    fetchedAt: now,
  };
  root.updatedAt = now;
  return JSON.stringify(root);
}

function normalizeUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const t = raw.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function lastFetchMsForStrategy(performanceMetaRaw, strategy) {
  if (!performanceMetaRaw || typeof performanceMetaRaw !== 'string') return 0;
  try {
    const p = JSON.parse(performanceMetaRaw);
    const block = p && typeof p === 'object' ? p[strategy] : null;
    const at = block && typeof block.fetchedAt === 'string' ? Date.parse(block.fetchedAt) : NaN;
    return Number.isFinite(at) ? at : 0;
  } catch {
    return 0;
  }
}

async function runPageSpeedInsightsV5(url, strategy, fetchFn, apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) {
    throw new Error(
      'PageSpeed API key is not configured. Set GOOGLE_PAGESPEED_API_KEY under Admin → Platform settings → API (Appwrite project global variable), then redeploy the sites function.',
    );
  }
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  api.searchParams.set('url', url);
  api.searchParams.set('key', key);
  api.searchParams.set('strategy', strategy === 'mobile' ? 'mobile' : 'desktop');
  const resp = await fetchFn(api.toString());
  const text = await resp.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`PageSpeed API returned non-JSON (HTTP ${resp.status})`);
  }
  if (!resp.ok) {
    const errMsg =
      body?.error?.message ||
      (Array.isArray(body?.error?.errors) && body.error.errors[0]?.message) ||
      `HTTP ${resp.status}`;
    throw new Error(errMsg);
  }
  const lh = body.lighthouseResult;
  if (!lh || typeof lh !== 'object') {
    throw new Error('PageSpeed API response missing lighthouseResult');
  }
  const cats = lh.categories || {};
  const score = (id) => {
    const c = cats[id];
    return c && typeof c.score === 'number' ? Math.round(c.score * 100) : null;
  };
  const scores = {
    performance: score('performance'),
    accessibility: score('accessibility'),
    bestPractices: score('best-practices'),
    seo: score('seo'),
  };
  const audits = lh.audits || {};
  const num = (id) => {
    const a = audits[id];
    return a && typeof a.numericValue === 'number' ? a.numericValue : null;
  };
  const coreWebVitals = {
    timeToFirstByteMs: num('server-response-time'),
    largestContentfulPaintMs: num('largest-contentful-paint'),
    cumulativeLayoutShift: num('cumulative-layout-shift'),
  };
  return {
    success: true,
    strategy,
    scores,
    coreWebVitals,
    analyzedUrl: typeof lh.finalUrl === 'string' ? lh.finalUrl : url,
    lighthouseVersion: typeof lh.lighthouseVersion === 'string' ? lh.lighthouseVersion : undefined,
  };
}

export default async function handleRunPagespeed({
  req,
  res,
  log,
  error,
  databases,
  users,
  client,
  fetch,
}) {
  const payload = req._parsedPayload || {};
  const siteId = payload.siteId || payload.site_id;
  if (!siteId) return fail(res, 'siteId is required.', 400);

  let userId;
  try {
    const endpoint = appwriteEndpoint();
    const projectId = appwriteProjectId();
    ({ userId } = await verifyJwtUser(req, payload, endpoint, projectId));
  } catch (e) {
    return fail(res, e.message || 'Unauthorized', 401);
  }

  const strategyRaw = typeof payload.strategy === 'string' ? payload.strategy.trim().toLowerCase() : '';
  const strategy = strategyRaw === 'mobile' ? 'mobile' : 'desktop';
  const bypassThrottle = payload.force === true || payload.skipThrottle === true;

  const dbId = String(appwriteDatabaseId() || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
  const coll = WPHUB_APPWRITE_IDS.platformTables.sites;

  try {
    const siteDoc = await databases.getDocument(dbId, coll, siteId);
    const ctx = await resolveWorkspaceContext(databases, userId, users);
    if (!sessionCanMutateSiteDocument(ctx, siteDoc, users)) {
      return fail(res, 'Site does not belong to this user.', 403);
    }

    const existing = siteDoc.performance_meta || siteDoc.performanceMeta || '';
    const lastMs = lastFetchMsForStrategy(existing, strategy);
    if (!bypassThrottle && PAGESPEED_MIN_INTERVAL_MS > 0 && lastMs > 0) {
      const elapsed = Date.now() - lastMs;
      if (elapsed < PAGESPEED_MIN_INTERVAL_MS) {
        const retryAfterSec = Math.ceil((PAGESPEED_MIN_INTERVAL_MS - elapsed) / 1000);
        return fail(
          res,
          `PageSpeed throttled: wait ${retryAfterSec}s before re-running ${strategy} for this site.`,
          429,
          { success: false, code: 'PAGESPEED_RATE_LIMIT', retryAfterSec },
        );
      }
    }

    const url = normalizeUrl(siteDoc.site_url || siteDoc.siteUrl || '');
    if (!url) {
      return fail(res, 'Site has no URL to analyze.', 400);
    }

    const pagespeedKey = await resolvePagespeedInsightsApiKey({ client });
    const result = await runPageSpeedInsightsV5(url, strategy, fetch, pagespeedKey);

    try {
      const merged = mergePerformanceMeta(existing, strategy, {
        scores: result.scores,
        coreWebVitals: result.coreWebVitals,
        analyzedUrl: result.analyzedUrl,
        lighthouseVersion: result.lighthouseVersion,
      });
      await databases.updateDocument(dbId, coll, siteId, { performance_meta: merged });
    } catch (persistErr) {
      log(`[sites] run_pagespeed persist failed: ${persistErr.message}`);
    }

    return ok(res, {
      success: true,
      strategy: result.strategy,
      scores: result.scores,
      coreWebVitals: result.coreWebVitals,
      analyzedUrl: result.analyzedUrl,
      lighthouseVersion: result.lighthouseVersion,
    });
  } catch (e) {
    error(`[sites] run_pagespeed: ${e.message}`);
    return fail(res, e.message || 'PageSpeed request failed.', 500);
  }
}
