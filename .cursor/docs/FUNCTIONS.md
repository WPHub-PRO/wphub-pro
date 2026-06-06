# Appwrite functions

All serverless handlers for WP Hub Pro. **Deploy metadata** comes from [`appwrite.config.json`](../../appwrite.config.json) at the repo root. **Handler source** lives in **`functions/`** inside the monorepo.

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

**Optional VCS restore** (only when `installationId`, `providerRepositoryId`, `providerBranch`, `providerRootDirectory` are set in config):

```bash
node .cursor/scripts/restore-function-vcs.js
```

Current config has **no VCS fields** — functions deploy from local `functions/<id>` paths via CLI.

**Naming:** function **`messaging`** ≠ table **`notifications`**.

---

## Handler layout (all 12 — TypeScript, Node.js 22)

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

| `$id` | Runtime | Timeout | Commands | Execute | UI / domain |
|-------|---------|---------|----------|---------|-------------|
| `bridge` | node-22 | 120 | npm install | any | Bridge download, release metadata |
| `library` | node-22 | 60 | npm install | any, users | Library, WP install |
| `messaging` | node-22 | 60 | pnpm install | any | Notifications, system email, templates |
| `platform-settings` | node-22 | 90 | npm install | any | Platform settings |
| `recovery-manager` | node-22 | 60 | npm install | any | Recovery (flat handler) |
| `sites` | node-22 | 300 | npm install | any | Sites, health AI |
| `stripe-api` | node-22 | 120 | npm install | any | Billing (Stripe) |
| `support` | node-22 | 30 | npm install | any | Support tickets |
| `uptime-robot` | node-22 | 120 | npm install | any | Uptime monitoring |
| `user-mailbox` | node-22 | 120 | npm install | any | Admin mailbox (IMAP) |
| `users` | node-22 | 120 | npm install | any | Teams, users |
| `wp-proxy` | node-22 | 120 | npm install | any | WordPress proxy / ZIP installs |

**Extra deps (beyond shared):** `library` → adm-zip · `stripe-api` → stripe · `user-mailbox` → imapflow, nodemailer, mailparser · `recovery-manager` → jsonwebtoken.

---

## Monorepo scripts

| Script | Purpose |
|--------|---------|
| `functions/scripts/function-ids.mjs` | Canonical list of 12 function ids |
| `functions/scripts/update-function-readmes.mjs` | Regenerate per-function README deploy sections |

See `functions/README.md`.
