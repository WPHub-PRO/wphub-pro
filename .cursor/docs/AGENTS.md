# WP Hub Pro — agents & workspace

**`wphubpro`** — workspace with **`.cursor/appwrite.config.json`** (git repo `github.com/wphub-pro/cursor`), docs in **`.cursor/docs/`**, scripts in **`.cursor/scripts/`**.

**Doc index:** [README.md](README.md) · [WORKSPACE.md](WORKSPACE.md) · [FUNCTIONS.md](FUNCTIONS.md) · [SHARED.md](SHARED.md) · [MODULAR-LAYERS.md](MODULAR-LAYERS.md)

---

## Repositories

| Path | Git repo | Role |
|------|----------|------|
| *(workspace root)* | — | Nested clones only |
| `.cursor/` | `github.com/wphub-pro/cursor` | Appwrite config, docs, rules, scripts — **CLI cwd** |
| `sites/wphubpro/` | nested clone | Vite platform — `npm run dev`, `build`, `lint` |
| `functions/` | `github.com/wphub-pro/functions` | 12 handlers + `shared/` npm package |
| `wphubpro-bridge/` | nested clone | WordPress bridge plugin |

Bootstrap: [WORKSPACE.md](WORKSPACE.md).

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
- **Sites:** `sites/wphubpro` (Appwrite site id `69e016bd001d4315876d`)

**Naming:** function **`messaging`** ≠ table **`notifications`**.

---

## Schema & id workflow

1. Edit **`appwrite.config.json`**.
2. **Always:** `cd .cursor && appwrite push functions --all --no-code`.
3. When tables changed: `cd .cursor && appwrite push tables`.
4. **`wphub-appwrite-ids.mdc`:** sync ids, publish `@code045/wphubpro-shared` if needed.

---

## Secrets

Never commit API keys or webhook secrets. Client: public Appwrite endpoint/project id and Stripe publishable key only — `sites/wphubpro/src/services/appwrite.ts`, `sites/wphubpro/src/lib/stripe-loader.ts`.

---

## Dev environment

| Service | Path | Command |
|---------|------|---------|
| Platform UI | `sites/wphubpro/` | `npm run dev` |
| Function | `functions/<id>/` | `pnpm install && pnpm run build` (local verify) |
| Shared package | `functions/shared/` | `npm run build` (esbuild → `mod.js`) |

### Tooling

Scripts: **`.cursor/scripts/`** (e.g. `bridge-release.js`, `appwrite-init-project.js`).

### Gotchas

- Publish `@code045/wphubpro-shared` before Appwrite deploy when shared code changed ([SHARED.md](SHARED.md)).
- Set **`NPM_TOKEN`** on Appwrite for restricted npm reads.
- Custom dev hosts: `server.allowedHosts` in `sites/wphubpro/vite.config.ts`.
- VCS deploy uses **`github.com/wphub-pro/functions`**; `providerRootDirectory` is `/<id>` inside that repo.
