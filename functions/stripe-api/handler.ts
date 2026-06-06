// Version: 1.2.0
/**
 * Stripe API Appwrite function — dispatch: handlers/router.js; shared helpers under lib/.
 * Set STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, and for `/user-billing`: APPWRITE_ENDPOINT,
 * project id + API key (`APPWRITE_PROJECT_ID` / `APPWRITE_API_KEY` or Appwrite-injected
 * `APPWRITE_FUNCTION_PROJECT_ID` / `APPWRITE_FUNCTION_API_KEY`), APPWRITE_DATABASE_ID (optional).
 *
 * Internal route `POST /internal/team-subscription/cancel` (from **users** team delete):
 * set **`WPHUB_INTERNAL_FUNCTION_KEY`** (same value on **users** and **stripe-api**).
 */
import { parsePayload, ok, fail } from '@code045/wphubpro-shared';
import { routeStripeRequest } from './handlers/router.ts';

export default async ({ req, res, log, error }) => {
  let payload = {};
  try {
    payload = parsePayload(req);
  } catch (e) {
    return fail(res, 'Invalid JSON payload', 400);
  }

  const path =
    (typeof payload.path === 'string' && payload.path) ||
    (typeof payload.stripePath === 'string' && payload.stripePath) ||
    (req && typeof req.path === 'string' && req.path.trim()) ||
    '';
  const method = String(
    (typeof payload.method === 'string' && payload.method) ||
      (req && typeof req.method === 'string' && req.method) ||
      'GET',
  ).toUpperCase();

  try {
    const data = await routeStripeRequest({
      req,
      path,
      method,
      body: payload.body,
    });
    return ok(res, data);
  } catch (e) {
    if (e && e.code === 'NOT_IMPLEMENTED') {
      return fail(res, e.message, 501);
    }
    const sc = e && typeof e.statusCode === 'number' && e.statusCode >= 400 ? e.statusCode : 500;
    error(`[stripe-api] ${e && e.message ? e.message : e}`);
    return fail(res, e && e.message ? e.message : 'Stripe request failed', sc);
  }
};
