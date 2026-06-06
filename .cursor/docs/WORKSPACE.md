# WP Hub Pro — workspace layout

`**wphubpro**` is the workspace root: **`.cursor/`** is the git repo (`github.com/wphub-pro/cursor`) with **`appwrite.config.json`**, agent docs under **`.cursor/docs/`**, scripts under **`.cursor/scripts/`**, and application code in nested Git clones.

Open the **workspace root** in Cursor so `.cursor/`, nested clones, and `../`-relative Appwrite paths resolve.

Some paths (`functions/`, `sites/wphubpro/`, `wphubpro-bridge/`) may be **gitignored** in the root repo — clone them locally for full indexing.

---

## On-disk tree


| Path                                                 | Role                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `[.cursor/appwrite.config.json](../appwrite.config.json)` | Appwrite CLI source of truth (functions, tables, buckets, sites) — git-tracked in `.cursor` repo |
| `[.cursor/docs/](README.md)`                         | Agent documentation                                                |
| `[.cursor/scripts/](../scripts/)`                    | Node tooling (bridge release, Appwrite init, …)                    |
| `[.cursor/rules/](../rules/)`                        | Cursor agent rules                                                 |
| `functions/`                                         | Functions monorepo — nested clone `github.com/wphub-pro/functions` |
| `sites/wphubpro/`                                    | Vite React platform app — nested clone                             |
| `wphubpro-bridge/`                                   | WordPress bridge plugin — nested clone                             |


---

## Bootstrap (nested clones)

```bash
git clone https://github.com/wphub-pro/cursor .cursor

git clone https://github.com/wphub-pro/functions  functions
git clone <wphubpro-app-url>                    sites/wphubpro
git clone <wphubpro-bridge-url>                 wphubpro-bridge
```

**Platform app:** `cd sites/wphubpro && npm run dev` (port 5173; restart after `.env` changes).

**Functions deploy:** from **`.cursor/`** (config cwd; paths like `../functions/bridge`):

```bash
cd .cursor
appwrite push functions
appwrite push tables
node scripts/restore-function-vcs.js   # after push — restore Git/VCS
```

See [FUNCTIONS.md](FUNCTIONS.md) · [SHARED.md](SHARED.md).

---

## Two path contexts


| Context                             | Function path example | Notes                                                                               |
| ----------------------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| **wphubpro workspace**              | `functions/bridge/`   | Local dev + config `"path": "../functions/bridge"` (CLI cwd: `.cursor/`) |
| **Functions Git repo (VCS deploy)** | `/bridge`             | Appwrite VCS → `github.com/wphub-pro/functions`, `providerRootDirectory: "/bridge"` |


Both refer to the same handler code; only the repo root differs.

---

## Functions monorepo layout

```text
functions/
  shared/                 # @code045/wphubpro-shared (npm source)
  scripts/                # monorepo tooling
  bridge/
  library/
  messaging/
  …                       # 12 function folders total
```

Each `functions/<id>/` has: `package.json`, `main.ts`, `handler.ts`, `handlers/`, `lib/`, `.appwriteignore`, `tsconfig.json`.

Handlers import `**@code045/wphubpro-shared**` from npm — not `functions/shared/` by path. See [SHARED.md](SHARED.md).

---

## Sub-agent tags

Label plan todos: `**[React]**` · `**[UI]**` · `**[Appwrite]**` · `**[Stripe]**`.

Rules: `**wphub-project.mdc**` (defaults) · `**wphub-agent-ui.mdc**` · `**wphub-agent-stripe.mdc**` · `**wphub-functions.mdc**` · `wphub-shared-package.mdc`..

See [AGENTS.md](AGENTS.md).