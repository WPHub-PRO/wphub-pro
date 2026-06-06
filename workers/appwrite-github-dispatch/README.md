# Appwrite webhook → GitHub dispatch (Cloudflare Worker)

Proxy because Appwrite webhooks cannot set `Authorization: Bearer` or a custom JSON body.

## Deploy

```bash
cd workers/appwrite-github-dispatch
npm create cloudflare@latest . -- --type=pre-existing   # if wrangler not installed
npx wrangler secret put GITHUB_PAT
npx wrangler deploy
```

Optional secrets: `GITHUB_REPO`, `GITHUB_DISPATCH_EVENT`, `APPWRITE_WEBHOOK_SIGNATURE`, `APPWRITE_WEBHOOK_URL` (exact webhook URL as configured in Appwrite Console, for signature verification).

## Appwrite Console

**Settings → Webhooks → Create**

| Field | Value |
|-------|--------|
| URL | `https://<your-worker>.workers.dev` |
| Events | `tablesdb.*.tables.*`, `tablesdb.*.tables.*.columns.*`, `buckets.*`, `functions.*.update` |

Appwrite sends its event JSON as body; the Worker ignores it and calls GitHub with the correct Authorization + `{"event_type":"appwrite-config-changed"}`.
