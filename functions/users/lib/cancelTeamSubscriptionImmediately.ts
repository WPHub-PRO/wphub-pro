import {
  appwriteEndpoint,
  appwriteProjectId,
  resolvedAppwriteApiKey,
  WPHUB_APPWRITE_IDS,
} from '@code045/wphubpro-shared';

function stripeApiFunctionId() {
  const fromEnv = String(process.env.STRIPE_API_FUNCTION_ID || '').trim();
  if (fromEnv) return fromEnv;
  const id =
    WPHUB_APPWRITE_IDS &&
    WPHUB_APPWRITE_IDS.functions &&
    typeof WPHUB_APPWRITE_IDS.functions.STRIPE_API === 'string'
      ? WPHUB_APPWRITE_IDS.functions.STRIPE_API.trim()
      : '';
  return id || 'stripe-api';
}

/**
 * Immediate cancel via **stripe-api** (`POST /internal/team-subscription/cancel`), not direct Stripe SDK.
 * Env on **users**: `WPHUB_INTERNAL_FUNCTION_KEY`, optional `STRIPE_API_FUNCTION_ID` (default `stripe-api`).
 *
 * @param {{ teamId: string; subscriptionId: string; req: object }} params
 * @returns {Promise<{ skipped: boolean; canceled?: string }>}
 */
async function cancelTeamSubscriptionImmediately({ teamId, subscriptionId, req }) {
  const raw = String(subscriptionId || '').trim();
  if (!raw || !raw.startsWith('sub_')) {
    return { skipped: true };
  }

  const internalKey = String(process.env.WPHUB_INTERNAL_FUNCTION_KEY || '').trim();
  if (!internalKey) {
    const err = new Error(
      'WPHUB_INTERNAL_FUNCTION_KEY is not configured; cannot cancel subscription via stripe-api.',
    );
    err.statusCode = 500;
    throw err;
  }

  const endpoint = appwriteEndpoint();
  const projectId = appwriteProjectId();
  const apiKey = resolvedAppwriteApiKey(req);
  if (!endpoint || !projectId || !apiKey) {
    const err = new Error('Appwrite credentials missing for stripe-api execution.');
    err.statusCode = 500;
    throw err;
  }

  const functionId = stripeApiFunctionId();
  const base = endpoint.replace(/\/$/, '');
  const url = `${base}/functions/${encodeURIComponent(functionId)}/executions`;

  const stripeApiPayload = {
    path: '/internal/team-subscription/cancel',
    method: 'POST',
    body: {
      teamId: String(teamId || '').trim(),
      subscriptionId: raw,
    },
  };

  const executionReq = {
    body: JSON.stringify(stripeApiPayload),
    async: false,
    headers: {
      'X-WPHUB-Internal-Key': internalKey,
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': projectId,
      'X-Appwrite-Key': apiKey,
      'X-Appwrite-Response-Format': '1.8.0',
    },
    body: JSON.stringify(executionReq),
  });

  const text = await resp.text();
  let execJson;
  try {
    execJson = text.trim() ? JSON.parse(text) : {};
  } catch {
    const err = new Error(`Appwrite execution response was not JSON: ${text.slice(0, 240)}`);
    err.statusCode = 502;
    throw err;
  }

  if (!resp.ok) {
    const msg =
      execJson && typeof execJson.message === 'string' && execJson.message
        ? execJson.message
        : `Appwrite execution HTTP ${resp.status}`;
    const err = new Error(msg);
    err.statusCode = resp.status >= 400 && resp.status < 600 ? resp.status : 502;
    throw err;
  }

  const statusFromExec =
    execJson && execJson.responseStatusCode != null ? Number(execJson.responseStatusCode) : 0;
  let inner = {};
  const rb = execJson && typeof execJson.responseBody === 'string' ? execJson.responseBody : '';
  if (rb.trim()) {
    try {
      inner = JSON.parse(rb);
    } catch {
      const err = new Error('stripe-api execution returned non-JSON responseBody');
      err.statusCode = 502;
      throw err;
    }
  }

  if (statusFromExec < 200 || statusFromExec >= 300) {
    const msg =
      inner && typeof inner.message === 'string' && inner.message
        ? inner.message
        : `stripe-api responded with HTTP ${statusFromExec}`;
    const err = new Error(msg);
    err.statusCode = statusFromExec >= 400 ? statusFromExec : 502;
    throw err;
  }

  if (inner && inner.success === false) {
    const err = new Error(typeof inner.message === 'string' ? inner.message : 'stripe-api cancel failed');
    err.statusCode = 500;
    throw err;
  }

  if (inner && inner.skipped) {
    return { skipped: true };
  }

  return { skipped: false, canceled: raw };
}

export { cancelTeamSubscriptionImmediately };
