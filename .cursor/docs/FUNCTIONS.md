# Appwrite functions

All serverless handlers for WP Hub Pro (13 functions). **Deploy metadata** comes from [`appwrite.config.json`](../../appwrite.config.json) at the repo root. **Handler source** lives in **`functions/`** inside the monorepo.

**Related:** [WORKSPACE.md](WORKSPACE.md) · [SHARED.md](SHARED.md) · [MODULAR-LAYERS.md](MODULAR-LAYERS.md) · [AGENTS.md](AGENTS.md)

---

## Workspace context

| Item | Location |
|------|----------|
| Appwrite CLI config | `appwrite.config.json` (repo root) — run CLI from repo root |
| Function handlers | `functions/<id>/` |
| Shared library | `functions/shared/` → npm `@code045/wphubpro-shared` |
| Config path per function | `"path": "functions/<id>"` |
| Entrypoint (config) | `main.ts` |
| Install command | `npm install` (11 functions) · `pnpm install` (`messaging`) |

**Deploy from repo root:**

```bash
appwrite push functions              # full deploy (code + settings)
appwrite push functions --all --no-code   # after appwrite.config.json edits (settings only)
```

**VCS (Git deploy):** all 13 functions use repo `1260883337` (`github.com/wphub-pro/wphub-pro`), branch `main`, root `/functions/<id>`.

Restore VCS after push (when remote drifts):

```bash
node .cursor/scripts/restore-function-vcs.js
node .cursor/scripts/restore-function-vcs.js --check   # verify only
```

**Naming:** function **`messaging`** ≠ table **`notifications`**.

---

## Handler layout (TypeScript, Node.js 22)

| File / folder | Role |
|---------------|------|
| `package.json` | `@code045/wphubpro-shared` pin + function-specific deps |
| `main.ts` | Thin entry → `./handler.ts` |
| `handler.ts` | Env, auth, action dispatch |
| `handlers/` | Per-action handlers (absent in `recovery-manager`) |
| `lib/` | Services, queries, local helpers (absent in `recovery-manager`) |
| `tsconfig.json` | `tsc` → `dist/` (local typecheck) |

**Import rule:** use **`@code045/wphubpro-shared`** directly — no path imports into `functions/shared/`, no `functionsLib.ts` barrel.

**Local verify:**

```bash
cd functions/<id>
npm install && npm run build    # messaging: pnpm install && pnpm run build
```

**IDs:** Sync `functions/shared/src/appwrite/ids.ts` with platform app — `wphub-appwrite-ids.mdc`.

**npm auth:** Each function has `.npmrc` for `@code045` scoped registry (`NPM_TOKEN` on Appwrite).

---

## Inventory (from `appwrite.config.json`)

| `$id` | Runtime | Timeout | Commands | Execute | VCS root | UI / domain |
|-------|---------|---------|----------|---------|----------|-------------|
| `bridge` | node-22 | 120 | npm install | any | `/functions/bridge` | Bridge download, release metadata |
| `library` | node-22 | 60 | npm install | any, users | `/functions/library` | Library, WP install |
| `messaging` | node-22 | 60 | pnpm install | any | `/functions/messaging` | Notifications, system email, templates |
| `platform-settings` | node-22 | 90 | npm install | any | `/functions/platform-settings` | Platform settings |
| `recovery-manager` | node-22 | 60 | npm install | any | `/functions/recovery-manager` | Recovery (flat handler) |
| `sites` | node-22 | 300 | npm install | any | `/functions/sites` | Sites, health AI |
| `stripe-api` | node-22 | 120 | npm install | any | `/functions/stripe-api` | Billing (Stripe) |
| `support` | node-22 | 30 | npm install | any | `/functions/support` | Support tickets |
| `uptime-robot` | node-22 | 120 | npm install | any | `/functions/uptime-robot` | Uptime monitoring |
| `user-mailbox` | node-22 | 120 | npm install | any | `/functions/user-mailbox` | Admin mailbox (IMAP) |
| `users` | node-22 | 120 | npm install | any | `/functions/users` | Teams, users |
| `wp-proxy` | node-22 | 120 | npm install | any | `/functions/wp-proxy` | WordPress proxy — plugins, themes, bridge ZIP |
| `github-config-sync` | node-22 | 15 | npm install | — (events only) | `/functions/github-config-sync` | Triggers GitHub config sync on schema events |

Shared VCS: `installationId: 69e016afb5c72c7bf95c`, `providerRepositoryId: 1260883337`, branch `main`, `providerSilentMode: true`.

**`github-config-sync`:** event-triggered (`databases.*` / `buckets.*` — not `tablesdb.*` or `functions.*`); set `GITHUB_PAT` on the function. Function-setting changes: use Worker webhook (`workers/appwrite-github-dispatch/`) or 6h GitHub Action.

**Extra deps (beyond shared):** `library` → adm-zip · `stripe-api` → stripe · `user-mailbox` → imapflow, nodemailer, mailparser · `recovery-manager` → jsonwebtoken.

---

## Monorepo scripts

| Script | Purpose |
|--------|---------|
| `functions/scripts/function-ids.mjs` | Canonical list of function ids |
| `functions/scripts/update-function-readmes.mjs` | Regenerate per-function README deploy sections |

See `functions/README.md`.

---

## `wp-proxy` — plugins & themes (bulk-only)

End-to-end: **Hub UI** → `postBridgeApiJsonWithMeta` → **`wp-proxy`** function → **`wphubpro-bridge`** REST → WordPress.

Detailed handler docs: [`functions/wp-proxy/README.md`](../../functions/wp-proxy/README.md). Bridge REST contract: **`wphubpro-bridge/README.md`** (sibling folder in the full workspace; not in the `wphub-pro` Git tree by default).

### Hub → wp-proxy envelope

```json
{ "siteId": "<sites-doc-id>", "handler": "<action-key>", "body": { "plugins": […] } }
```

- **`handler`:** canonical keys only — no legacy aliases (`plugins/de-install`, `themes/uninstall`, underscore forms).
- **`body`:** always **`plugins[]`** or **`themes[]`** — non-empty arrays of **objects**. Single-row UI actions use array length **1**.

### Handler keys

| Handler | Bridge path |
|---------|-------------|
| `plugins/install` | `POST wphubpro/v1/plugins/manage/install` |
| `plugins/update` | `POST …/plugins/manage/update` (WP.org slug+version rows → `…/install`) |
| `plugins/activate` | `POST …/plugins/manage/activate` |
| `plugins/deactivate` | `POST …/plugins/manage/deactivate` |
| `plugins/uninstall` | `POST …/plugins/manage/delete` |
| `themes/install` | `POST wphubpro/v1/themes/manage/install` |
| `themes/update` | `POST …/themes/manage/update` |
| `themes/activate` | `POST …/themes/manage/activate` |
| `themes/deactivate` | `POST …/themes/manage/deactivate` |
| `themes/delete` | `POST …/themes/manage/delete` |
| `bridge/forceUpdate` | bridge self-update (separate concern) |
| `sync` | `POST wphubpro/v1/hub/invoke` with `handler: sync` — bridge runs plugins/themes/wp_meta + Site Health and posts `sync_site_meta` |

### Manual Site Health refresh (Hub UI)

Site detail stethoscope button → `useRequestSiteHealthRefresh` → **wp-proxy** `handler: sync` → bridge `hub/invoke` `sync` → **`sites`** `sync_site_meta` (includes `health_meta`). Legacy `sites` action `check_site_health` / bridge `/health/push` remain for cron and backward compatibility.

### Install row fields (each `plugins[]` / `themes[]` entry)

One of:

- `zip_url` (HTTPS) + optional `source`: `official` \| `local` \| `remote`
- `libraryItemId` + `version` (composite `docId::encodedVersion` supported)
- `slug` + `version` (WordPress.org)

Optional: `plugin` (file path), `routeSlug`, `stylesheet` (themes).

wp-proxy resolves library ZIPs from Appwrite Storage / library docs before forwarding. **`zip_base64` is rejected.**

### Manage row fields (activate / deactivate / update / uninstall / delete)

- **Plugins:** `{ plugin, slug?, version?, zip_url?, libraryItemId?, source? }` — `plugin` file path required.
- **Themes:** `{ stylesheet, slug?, version?, zip_url?, libraryItemId?, source? }`.

### wp-proxy forwarding

- **Install / activate / deactivate / uninstall / delete:** one bulk bridge POST with the full resolved array.
- **Update:** resolve all rows, then **at most two** bridge calls — `manage/update` batch + `manage/install` batch (WP.org plugin updates via install-version path).

### Bridge → Hub response (all manage endpoints)

```json
{
  "results": [
    { "id": "akismet/akismet.php", "ok": true, "installed": true, "activated": true },
    { "id": "other/other.php", "ok": false, "installed": true, "activated": false, "error": "Activation failed: …" }
  ],
  "succeeded": 1,
  "failed": 1
}
```

| Field | Meaning |
|-------|---------|
| `ok` | Overall success for this item (install + activate count as one step on install) |
| `installed` | Package installed or updated successfully |
| `activated` | Item is active after the operation |
| `error` | Failure message when `ok` is false |

Partial batch failures do not abort other items.

### Bridge-side behavior (summary)

| Action | Rule |
|--------|------|
| Plugin install | Always activate after successful install |
| Plugin update | Reactivate if the plugin was active before update |
| Theme bulk install | Install all items; **activate only the last successful** theme in the array |
| Theme update | Active theme stays active |
| Theme delete | Cannot delete the currently active theme |

### Platform domain layer (no UI changes required)

| Path | Role |
|------|------|
| `sites/wphubpro/src/lib/platform-api.ts` | `postBridgeApiJsonWithMeta` → `wp-proxy` |
| `sites/wphubpro/src/domains/sites/extensionBulkFromSite.ts` | Unified bulk runners + single-item wrappers |
| `sites/wphubpro/src/domains/sites/pluginUpdateFromSite.ts` | Update resolution (WP.org / library / bridge zip) |
| `sites/wphubpro/src/domains/library/libraryCollectionInstall.ts` | Per site: one `plugins/install` + one `themes/install` batch |
| `sites/wphubpro/src/domains/library/libraryFamilyInstall.ts` | Same batch pattern as collections |

Legacy single-field bodies (`body.plugin`, top-level `body.slug`) and wp-proxy handler aliases are **removed** — use arrays only.

**Agent rule:** `.cursor/rules/wphub-bridge-extensions.mdc` when editing this flow.

Bridge plugin releases: bump **`Version:`** in `wphubpro-bridge/wphubpro-bridge.php` per commit with runtime changes — **`wphub-bridge-plugin.mdc`**.
