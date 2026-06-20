# WP Hub Pro — workspace layout

**`wphub-pro`** is a single Git monorepo: [github.com/wphub-pro/wphub-pro](https://github.com/wphub-pro/wphub-pro).

Open the **repository root** in Cursor so `appwrite.config.json`, `functions/`, `sites/wphubpro/`, and `.cursor/` resolve together.

---

## On-disk tree

| Path | Role |
|------|------|
| [`appwrite.config.json`](../../appwrite.config.json) | Appwrite CLI source of truth (functions, tables, buckets, sites) |
| [`.cursor/docs/`](README.md) | Agent documentation |
| [`.cursor/scripts/`](../scripts/) | Node tooling (bridge release, VCS restore) |
| [`.cursor/rules/`](../rules/) | Cursor agent rules |
| `functions/` | 13 Appwrite handlers + `shared/` npm package source |
| `sites/wphubpro/` | Vite React platform app |
| `sites/wphubpro-landing/` | Landing site (in config; may be absent locally) |

---

## Bootstrap

```bash
git clone https://github.com/wphub-pro/wphub-pro.git
cd wphub-pro
```

**Platform app:**

```bash
cd sites/wphubpro && npm run dev   # port 5173; restart after .env changes
```

**Appwrite deploy** (from repo root):

```bash
appwrite push functions              # full deploy (code + settings)
appwrite push functions --all --no-code   # settings only after config edits
appwrite push tables                 # when schema changed
```

Optional VCS restore (only when VCS fields exist in config):

```bash
node .cursor/scripts/restore-function-vcs.js
```

See [FUNCTIONS.md](FUNCTIONS.md) · [SHARED.md](SHARED.md).

### Sync config from Appwrite Console

```bash
node .cursor/scripts/sync-appwrite-config-from-cloud.js
```

Pulls **tables**, **buckets**, and **function settings** (incl. Git/VCS) from cloud into `appwrite.config.json`. Local function `path` values are kept.

**GitHub Action** (`.github/workflows/sync-appwrite-config.yml`): scheduled every 6h + manual + webhook trigger. Set secret `APPWRITE_API_KEY` on the repo.

**Near-real-time sync (kies één):**

| Optie | Setup |
|-------|--------|
| **A — Appwrite function** | Deploy `functions/github-config-sync`. Zet **`GITHUB_PAT`**. Events: `databases.*.tables.*`, `buckets.*` (Appwrite accepteert geen `tablesdb.*` of `functions.*` als function-events). |
| **B — Cloudflare Worker** | Voor **alle** config-wijzigingen incl. function settings. Webhook → Worker-URL. Zie `workers/appwrite-github-dispatch/README.md`. |

Appwrite webhooks kunnen **geen** Bearer-header of custom body — daarom A of B, niet rechtstreeks naar `api.github.com`.

**Secrets:** `GITHUB_PAT` (fine-grained: Contents read/write op `wphub-pro`). GitHub Action gebruikt daarnaast `APPWRITE_API_KEY`.

---

## Path context

All `appwrite.config.json` paths are **repo-root relative**:

| Resource | Config `path` example | Local path |
|----------|----------------------|------------|
| Function | `functions/bridge` | `functions/bridge/` |
| Site | `sites/wphubpro` | `sites/wphubpro/` |

Run the Appwrite CLI from the **repository root** (where `appwrite.config.json` lives).

---

## Functions layout

```text
functions/
  shared/                 # @code045/wphubpro-shared (npm source)
  scripts/                # function-ids.mjs, update-function-readmes.mjs
  types/                  # IDE shim for shared package
  bridge/
  library/
  messaging/
  github-config-sync/
  …                       # 13 function folders total
```

Each `functions/<id>/` has: `package.json`, `main.ts`, `handler.ts`, `handlers/`, `lib/`, `tsconfig.json`.

**Exception:** `recovery-manager/` is flat (no `handlers/` or `lib/`).

Handlers import **`@code045/wphubpro-shared`** from npm — not `functions/shared/` by path. See [SHARED.md](SHARED.md).

---

## Sub-agent tags

Label plan todos: **`[React]`** · **`[UI]`** · **`[Appwrite]`** · **`[Stripe]`**.

Rules: **`wphub-project.mdc`** (defaults) · **`wphub-agent-ui.mdc`** · **`wphub-agent-stripe.mdc`** · **`wphub-functions.mdc`** · **`wphub-bridge-extensions.mdc`** (plugins/themes bulk) · **`wphub-bridge-plugin.mdc`** (bridge version bump) · **`wphub-shared-package.mdc`**.

See [AGENTS.md](AGENTS.md).
