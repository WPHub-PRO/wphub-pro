/**
 * True when parsed JSON inside `body.body` looks like a Hub function payload (not arbitrary message text).
 * @param {Record<string, unknown>} inner
 * @returns {boolean}
 */
function innerLooksLikeHubJsonPayload(inner) {
  if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return false;
  if ('recipientTeamIds' in inner || 'recipient_team_ids' in inner) return true;
  if ('recipientUserIds' in inner || 'recipient_user_ids' in inner) return true;
  if ('broadcast' in inner && ('title' in inner || 'type' in inner)) return true;
  /** wp-proxy / sites-style payloads nested under `body` + `jwt` (merge before early-return). */
  if ((inner.siteId || inner.site_id) && (inner.endpoint || inner.handler)) return true;
  return false;
}

/**
 * Appwrite sometimes delivers client JSON as `{ action, body: "<stringified object>" }`.
 * Returning that object as-is drops fields that only exist inside the string (e.g. `recipientTeamIds`).
 * When `body` is JSON that matches our payload shape, merge inner fields and keep notification `body` from inner.
 * @param {Record<string, unknown>} obj
 * @returns {Record<string, unknown>}
 */
function mergeExecutionBodyShell(obj) {
  const bodyStr = obj.body;
  if (typeof bodyStr !== 'string') return obj;
  const trimmed = bodyStr.trim();
  if (!trimmed.startsWith('{')) return obj;
  let inner;
  try {
    inner = JSON.parse(trimmed);
  } catch {
    return obj;
  }
  if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return obj;
  if (!innerLooksLikeHubJsonPayload(inner)) return obj;
  const { body: _omit, ...shellRest } = obj;
  const merged = { ...inner, ...shellRest };
  if (Object.prototype.hasOwnProperty.call(inner, 'body')) {
    merged.body = inner.body;
  }
  return merged;
}

/**
 * Parses Appwrite function `req` body (Hub nested `body.body`, plain JSON, `bodyRaw`, string `payload`).
 */
function parsePayload(req) {
  if (!req) return {};
  let body = req.body;
  if (body && typeof body === 'object') {
    body = mergeExecutionBodyShell(body);
    if (body.siteId || body.site_id || body.action || body.jwt) return body;
    if (typeof body.body === 'string') {
      try {
        const parsed = JSON.parse(body.body.trim());
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    return body;
  }
  if (req.bodyRaw && typeof req.bodyRaw === 'string') {
    try {
      const p = JSON.parse(req.bodyRaw);
      return p && typeof p === 'object' ? p : {};
    } catch {
      return {};
    }
  }
  if (req.payload && typeof req.payload === 'object') return req.payload;
  if (req.payload && typeof req.payload === 'string') {
    try {
      const p = JSON.parse(req.payload);
      return p && typeof p === 'object' ? p : {};
    } catch {
      return {};
    }
  }
  const raw = req.payload || req.bodyRaw || req.body;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Parse a JSON string into an object; invalid input yields `fallback`.
 * @template {Record<string, unknown>} T
 * @param {unknown} raw
 * @param {T} fallback
 * @returns {T}
 */
function parseOptionalJsonObject(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return /** @type {T} */ (/** @type {unknown} */ (raw));
  }
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    const o = JSON.parse(raw);
    return typeof o === 'object' && o !== null && !Array.isArray(o) ? /** @type {T} */ (o) : fallback;
  } catch {
    return fallback;
  }
}

export { parsePayload, parseOptionalJsonObject };
