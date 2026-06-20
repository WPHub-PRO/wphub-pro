# wp-proxy

Appwrite function: **Hub → WordPress bridge** for plugin/theme management and bridge self-update.

**Inventory:** [`.cursor/docs/FUNCTIONS.md`](../../.cursor/docs/FUNCTIONS.md) (wp-proxy section).

---

## Entry

- **`handler.ts`** — dispatch by `payload.handler` (canonical keys only).
- **`lib/connectBridge.ts`** — `callBridgeRest`: load site, decrypt secret, POST `{site_url}/wp-json/wphubpro/v1/…`.
- **`lib/normalizeBulkBody.ts`** — strict `plugins[]` / `themes[]` normalization; `mergeBulkResponses`.
- **`lib/getResourceItem.ts`** — resolve library / WP.org ZIP URLs server-side.

---

## Hub execution payload

```json
{
  "siteId": "<appwrite-sites-doc-id>",
  "handler": "plugins/update",
  "body": { "plugins": [{ "plugin": "akismet/akismet.php", "slug": "akismet", "version": "5.3" }] }
}
```

**Rules**

- **`body.plugins`** or **`body.themes`** must be a **non-empty array of objects** (never top-level `plugin` / `slug`).
- **`handler`** must match a key in `handler.ts` `HANDLERS` exactly (no `plugins/de-install`, `themes/uninstall`, or underscore aliases).
- wp-proxy strips Hub-only metadata, injects `bridge_secret`, rejects `zip_base64`.

---

## Handlers

| Handler | Source | Bridge |
|---------|--------|--------|
| `plugins/install` | `handlers/plugins/install.ts` | bulk `plugins/manage/install` |
| `plugins/update` | `handlers/plugins/update.ts` | bulk `manage/update` + optional bulk `manage/install` |
| `plugins/activate` | `handlers/plugins/activate.ts` | bulk `manage/activate` |
| `plugins/deactivate` | `handlers/plugins/deactivate.ts` | bulk `manage/deactivate` |
| `plugins/uninstall` | `handlers/plugins/uninstall.ts` | bulk `manage/delete` |
| `themes/install` | `handlers/themes/install.ts` | bulk `themes/manage/install` |
| `themes/update` | `handlers/themes/update.ts` | bulk `manage/update` |
| `themes/activate` | `handlers/themes/activate.ts` | bulk `manage/activate` |
| `themes/deactivate` | `handlers/themes/deactivate.ts` | bulk `manage/deactivate` |
| `themes/delete` | `handlers/themes/delete.ts` | bulk `manage/delete` |
| `bridge/forceUpdate` | `handlers/bridge/forceUpdate.ts` | bridge release update |

---

## Install rows

Each `plugins[]` / `themes[]` entry needs one of:

| Path | Fields |
|------|--------|
| HTTPS zip | `zip_url` (+ optional `source`) |
| Library | `libraryItemId` + `version` |
| WordPress.org | `slug` + `version` |

Composite library id: `documentId::encodeURIComponent(version)`.

---

## Update forwarding

1. Normalize full `plugins[]` / `themes[]` array.
2. Resolve ZIP / library per row; collect pre-errors.
3. **Plugins:** split resolved rows into `manage/update` batch vs `manage/install` batch (WP.org slug+version upgrades).
4. **Themes:** single bulk `manage/update` call.
5. Merge pre-errors + bridge `{ results, succeeded, failed }`.

---

## Response shape (passthrough from bridge)

```json
{
  "results": [
    { "id": "twentytwentyfour", "ok": true, "installed": true, "activated": true }
  ],
  "succeeded": 1,
  "failed": 0
}
```

Hub parses via `summarizeBulkPayload` in `sites/wphubpro/src/domains/sites/extensionBulkFromSite.ts`.

---

## Local verify

```bash
cd functions/wp-proxy
npm install && npm run build
```

Deploy from repo root: `appwrite push functions` (or push `wp-proxy` only).
