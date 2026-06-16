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
| `wp-proxy` | node-22 | 120 | npm install | any | `/functions/wp-proxy` | WordPress proxy / ZIP installs |

**`wp-proxy` body shapes (plugins & themes):** install/update handlers accept the same resolution inputs — direct `zip_url` (+ optional `source`: `official` \| `local` \| `remote`), `libraryItemId` + `version` (composite `id::version` supported), or `slug` + `version` (themes: `slug`/`stylesheet`; plugins: `slug`/`plugin` path). Official library rows use bridge `install-version`; other sources use `install-from-zip`. Hub handlers: `plugins/activate`, `plugins/deactivate`, `plugins/uninstall`, `plugins/update`, `plugins/install`; `themes/activate`, `themes/deactivate`, `themes/uninstall`, `themes/update`, `themes/install`. Bulk activate/deactivate/update/uninstall use `plugins[]` or `themes[]` arrays with the same per-row fields.
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
