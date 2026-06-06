/**
 * Cloudflare Worker: Appwrite webhook → GitHub repository_dispatch.
 *
 * Env (Worker secrets):
 *   GITHUB_PAT              — fine-grained PAT, Contents read/write on wphub-pro
 *   GITHUB_REPO             — optional, default wphub-pro/wphub-pro
 *   GITHUB_DISPATCH_EVENT   — optional, default appwrite-config-changed
 *   APPWRITE_WEBHOOK_SIGNATURE — optional; verify X-Appwrite-Webhook-Signature
 */

function base64FromBytes(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function verifyAppwriteSignature(webhookUrl, body, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(webhookUrl + body));
  const expected = base64FromBytes(new Uint8Array(mac));
  return expected === signatureHeader;
}

async function dispatchGitHub(env) {
  const repo = env.GITHUB_REPO || 'wphub-pro/wphub-pro';
  const eventType = env.GITHUB_DISPATCH_EVENT || 'appwrite-config-changed';
  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: eventType }),
  });
  if (!res.ok) {
    throw new Error(`GitHub ${res.status}: ${await res.text()}`);
  }
  return { repo, event_type: eventType };
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    if (!env.GITHUB_PAT) {
      return new Response('GITHUB_PAT not configured', { status: 500 });
    }

    const body = await request.text();
    const webhookUrl = env.APPWRITE_WEBHOOK_URL || request.url;

    if (env.APPWRITE_WEBHOOK_SIGNATURE) {
      const sig = request.headers.get('x-appwrite-webhook-signature');
      const ok = await verifyAppwriteSignature(webhookUrl, body, sig, env.APPWRITE_WEBHOOK_SIGNATURE);
      if (!ok) {
        return new Response('Invalid webhook signature', { status: 401 });
      }
    }

    try {
      const result = await dispatchGitHub(env);
      return Response.json({ ok: true, ...result });
    } catch (err) {
      return new Response(err instanceof Error ? err.message : String(err), { status: 502 });
    }
  },
};
