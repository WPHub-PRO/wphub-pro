# WP Hub Pro — agents & workspace

**`wphub-pro`** — monorepo at [github.com/wphub-pro/wphub-pro](https://github.com/wphub-pro/wphub-pro). Appwrite config at **`appwrite.config.json`** (repo root). Agent docs in **`.cursor/docs/`**, scripts in **`.cursor/scripts/`**.

**Doc index:** [README.md](README.md) · [WORKSPACE.md](WORKSPACE.md) · [FUNCTIONS.md](FUNCTIONS.md) · [SHARED.md](SHARED.md) · [MODULAR-LAYERS.md](MODULAR-LAYERS.md)

---

## Repository layout

| Path | Role |
|------|------|
| `appwrite.config.json` | Appwrite CLI source of truth — functions, tables, buckets, sites |
| `.cursor/docs/` | Agent documentation |
| `.cursor/rules/` | Cursor agent rules |
| `.cursor/scripts/` | Node tooling (`bridge-release.js`, `restore-function-vcs.js`) |
| `sites/wphubpro/` | Vite React platform app |
| `functions/` | 12 Appwrite handlers + `shared/` npm package source |

Clone once:

```bash
git clone https://github.com/wphub-pro/wphub-pro.git
cd wphub-pro
```

See [WORKSPACE.md](WORKSPACE.md).

---

## Platform app (quick)

**Path:** `sites/wphubpro/`

```bash
cd sites/wphubpro
npm run dev      # Vite, port 5173 — restart after .env changes
npm run build
npm run lint
```

- Import alias **`@/`** → `src/` (`vite.config.ts`).
- Appwrite function calls: **`src/integrations/appwrite/executeFunction.ts`**.
- Resource ids: **`src/config/wphubAppwriteIds.ts`** + **`generated/appwrite/`**.

---

## Cursor sub-agent tags

Label each plan todo with **one** tag: **`[React]`** · **`[UI]`** · **`[Appwrite]`** · **`[Stripe]`**.

| Tag | Enable / read |
|-----|----------------|
| **`[React]`** | `wphub-project.mdc` · [MODULAR-LAYERS.md](MODULAR-LAYERS.md) |
| **`[UI]`** | `wphub-agent-ui.mdc` |
| **`[Appwrite]`** | `wphub-functions.mdc` · `wphub-appwrite-schema.mdc` · `wphub-appwrite-ids.mdc` |
| **`[Stripe]`** | `wphub-agent-stripe.mdc` |

---

## Appwrite (from `appwrite.config.json`)

- **Project:** `wphub-pro` · **Endpoint:** `https://fra.cloud.appwrite.io/v1`
- **Database:** `platform_db` (17 tables) — see config `tables[]`
- **Functions:** 12 ids — [FUNCTIONS.md](FUNCTIONS.md)
- **Buckets:** 6 — `bridge`, `avatars`, `media_library`, `plugins`, `themes`, `6a0e670d00380379a6d4`
- **Sites:** `sites/wphubpro` (id `69e016bd001d4315876d`) · `sites/wphubpro-landing` (config only; directory may be absent locally)

**Naming:** function **`messaging`** ≠ table **`notifications`**.

---

## Schema & deploy workflow

### Cloud → repo (pull / sync)

When settings change in the **Appwrite Console** (tables, buckets, function config), sync into `appwrite.config.json`:

```bash
node .cursor/scripts/sync-appwrite-config-from-cloud.js
```

**Automatic:** GitHub Action `.github/workflows/sync-appwrite-config.yml` runs every 6 hours and on `repository_dispatch` (`appwrite-config-changed`). Requires repo secret **`APPWRITE_API_KEY`** (read scopes for tables, buckets, functions).

Optional near-real-time: Appwrite **Webhook** on events `tablesdb.*.tables.*`, `tablesdb.*.tables.*.columns.*`, `buckets.*`, `functions.*.update` → trigger GitHub `repository_dispatch` (see [WORKSPACE.md](WORKSPACE.md)).

### Repo → cloud (push)

1. Edit **`appwrite.config.json`** at the repo root.
2. **Always** after function settings change:

```bash
appwrite push functions --all --no-code
```

3. When tables changed: `appwrite push tables`.
4. Full code deploy: `appwrite push functions` (or per-function push).
5. **`wphub-appwrite-ids.mdc`:** sync ids, publish `@code045/wphubpro-shared` when shared ids change.

**VCS restore:** Git deploy uses `github.com/wphub-pro/wphub-pro` with `providerRootDirectory: /functions/<id>`. After push, run `node .cursor/scripts/restore-function-vcs.js` if VCS drifts.

---

## Secrets

Never commit API keys or webhook secrets. Client: public Appwrite endpoint/project id and Stripe publishable key only — `sites/wphubpro/src/services/appwrite.ts`, `sites/wphubpro/src/lib/stripe-loader.ts`.

---

## Dev environment

| Service | Path | Command |
|---------|------|---------|
| Platform UI | `sites/wphubpro/` | `npm run dev` |
| Function | `functions/<id>/` | `npm install && npm run build` (or `pnpm` for `messaging`) |
| Shared package | `functions/shared/` | `npm run build` (esbuild → `mod.js`) |

### Tooling

Scripts: **`.cursor/scripts/`** — `sync-appwrite-config-from-cloud.js` (pull tables/buckets/functions from cloud), `bridge-release.js`, `restore-function-vcs.js`.

### Gotchas

- Publish `@code045/wphubpro-shared` before Appwrite deploy when shared code changed ([SHARED.md](SHARED.md)).
- Set **`NPM_TOKEN`** on Appwrite for restricted npm reads.
- Custom dev hosts: `server.allowedHosts` in `sites/wphubpro/vite.config.ts`.
- `bridge-release.js` expects bridge plugin sources at `wphubpro-bridge/` (optional; not in monorepo by default).
