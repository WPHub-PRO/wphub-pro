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
| `functions/` | 12 Appwrite handlers + `shared/` npm package source |
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
| **A — Appwrite function** (aanbevolen) | Deploy `functions/github-config-sync`. Zet function variable **`GITHUB_PAT`** (secret). Function luistert naar schema-events en roept GitHub `repository_dispatch` aan. Geen webhook nodig. |
| **B — Cloudflare Worker** | Deploy `workers/appwrite-github-dispatch/`. Appwrite Console → Webhooks → URL = Worker-URL. Worker zet Authorization + body goed voor GitHub. Zie `workers/appwrite-github-dispatch/README.md`. |

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

Rules: **`wphub-project.mdc`** (defaults) · **`wphub-agent-ui.mdc`** · **`wphub-agent-stripe.mdc`** · **`wphub-functions.mdc`** · **`wphub-shared-package.mdc`**.

See [AGENTS.md](AGENTS.md).
