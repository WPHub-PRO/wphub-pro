/**
 * Single Appwrite Function entry:
 * - Webhook: header `UR-API-TOKEN` and/or JSON `apiKey` (same as `UPTIME_ROBOT_API_KEY`) + `action: webhook` when no header early-route.
 * - JWT payload action `get_*` → read handlers (UptimeRobot queries).
 * - Else provisioning sync: `ensure` | `delete` | `reconcile` | `pause` | `resume`.
 *
 * Debug: set `DEBUG_UPTIME_ROBOT` on the function (see `lib/debug.js`).
 */

import { getHeader } from './lib/httpHeaders.ts';
import { debugLog } from './lib/debug.ts';
import { parsePayload, fail } from '@code045/wphubpro-shared';
import handleWebhook from './handlers/webhook.ts';
import handleReadUptime from './handlers/readUptime.ts';
import handleSync from './handlers/sync.ts';

export default async (ctx) => {
  const { log, req, res } = ctx;

  let payload = {};
  try {
    payload = parsePayload(req);
  } catch {
    debugLog(log, 'parsePayload failed invalid JSON');
    return fail(res, 'Invalid JSON body.', 400);
  }

  const action = String(payload.action || '')
    .trim()
    .toLowerCase();
  const headerToken = getHeader(req && req.headers, 'UR-API-TOKEN');

  if (headerToken.length > 0) {
    if (action !== 'webhook') {
      debugLog(log, 'UR-API-TOKEN present but action is not webhook', action || '(empty)');
      return fail(
        res,
        'Invalid webhook request: expected JSON body with action "webhook" when using UR-API-TOKEN header.',
        400,
      );
    }
    req._parsedPayload = payload;
    debugLog(log, 'route webhook');
    return handleWebhook(ctx);
  }

  debugLog(log, 'route payload-router');

  req._parsedPayload = payload;

  debugLog(log, 'parsed action=', action || '(empty)', 'jwtLen=', typeof payload.jwt === 'string' ? payload.jwt.length : 0);
  debugLog(log, 'payload keys', Object.keys(payload || {}));

  if (['get_monitor', 'get_monitors', 'get_recent_incidents'].includes(action)) {
    debugLog(log, 'dispatch readUptime');
    return handleReadUptime(ctx);
  }

  if (['ensure', 'delete', 'reconcile', 'pause', 'resume'].includes(action)) {
    debugLog(log, 'dispatch sync');
    return handleSync(ctx);
  }

  if (['webhook'].includes(action)) {
    debugLog(log, 'dispatch webhook');
    return handleWebhook(ctx);
  }

  debugLog(log, 'invalid action — returning 400');
  return fail(
    res,
    'Invalid or missing action. Expected: webhook (UR-API-TOKEN header or apiKey in JSON body), ensure, delete, reconcile, pause, resume, get_monitor, get_monitors, get_recent_incidents.',
    400,
  );
};
