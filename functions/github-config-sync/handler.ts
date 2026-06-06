/**
 * github-config-sync — triggers GitHub repository_dispatch after Appwrite schema/config events.
 * Set function variables: GITHUB_PAT (secret), optional GITHUB_REPO, GITHUB_DISPATCH_EVENT.
 */
import { ok, fail, readEnv } from '@code045/wphubpro-shared';

const GITHUB_API = 'https://api.github.com';

async function dispatchToGitHub(repo: string, eventType: string, pat: string) {
  const res = await fetch(`${GITHUB_API}/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: eventType }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${res.status}: ${text}`);
  }
}

export default async ({ res, log, error }) => {
  const pat = readEnv('GITHUB_PAT');
  const repo = readEnv('GITHUB_REPO') || 'wphub-pro/wphub-pro';
  const eventType = readEnv('GITHUB_DISPATCH_EVENT') || 'appwrite-config-changed';

  if (!pat) {
    return fail(res, 'GITHUB_PAT is not configured on this function');
  }

  try {
    await dispatchToGitHub(repo, eventType, pat);
    log(`repository_dispatch → ${repo} (${eventType})`);
    return ok(res, { dispatched: true, repo, event_type: eventType });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    error(`github-config-sync: ${message}`);
    return fail(res, message);
  }
};
