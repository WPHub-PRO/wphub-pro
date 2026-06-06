# Appwrite functions

All serverless handlers for WP Hub Pro. **Deploy metadata** comes from [`.cursor/appwrite.config.json`](../appwrite.config.json). **Handler source** lives in the **`functions/`** monorepo clone (`github.com/wphub-pro/functions`).

**Related:** [WORKSPACE.md](WORKSPACE.md) · [SHARED.md](SHARED.md) · [MODULAR-LAYERS.md](MODULAR-LAYERS.md) · [AGENTS.md](AGENTS.md)

---

## Workspace context

| Item | Location |
|------|----------|
| Appwrite CLI config | `.cursor/appwrite.config.json` — run CLI from `.cursor/` |
| Functions monorepo | `functions/` clone |
| Shared library | `functions/shared/` → npm `@code045/wphubpro-shared` |
| Local path in config | `"path": "../functions/<id>"` |
| VCS Git repo | `github.com/wphub-pro/functions` (`providerRepositoryId: 1253976054`) |
| VCS root per function | `providerRootDirectory: "/<id>"` |
| Entrypoint (config) | `main.ts` |
| Install command | `npm install` (most) · `pnpm install` (`messaging`) |

**Deploy from `.cursor/`:**

```bash
cd .cursor
appwrite push functions              # full deploy (code + settings)
appwrite push functions --all --no-code   # after appwrite.config.json edits (settings only)
node scripts/restore-function-vcs.js   # restore Git/VCS after push (required)
```

**Naming:** function **`messaging`** ≠ table **`notifications`**.

---

## Handler layout (all 12 — TypeScript)

| File / folder | Role |
|---------------|------|
| `package.json` | `@code045/wphubpro-shared` pin + function-specific deps |
| `main.ts` | Thin entry → `./handler.ts` |
| `handler.ts` | Env, auth, action dispatch |
| `handlers/` | Per-action handlers |
| `lib/` | Services, queries, local helpers |
| `.appwriteignore` | Deploy exclusions |
| `tsconfig.json` | `tsc` → `dist/` (local verify) |

**Import rule:** use **`@code045/wphubpro-shared`** directly — no `functionsLib.ts` barrel.

**Local verify:**

```bash
cd functions/<id>
pnpm install   # or npm install
pnpm run build
```

**IDs:** Sync `functions/shared/src/appwrite/ids.ts` with platform app — `wphub-appwrite-ids.mdc`.

---

## Inventory (from `appwrite.config.json`)

| `$id` | Runtime | Timeout | Commands | VCS root | UI / domain |
|-------|---------|---------|----------|----------|-------------|
| `bridge` | node-22 | 120 | npm install | `/bridge` | Bridge download, release metadata |
| `library` | node-22 | 60 | npm install | `/library` | Library, WP install |
| `messaging` | node-22 | 60 | pnpm install | `/messaging` | Notifications, system email, templates |
| `platform-settings` | node-22 | 90 | npm install | `/platform-settings` | Platform settings |
| `recovery-manager` | node-22 | 60 | npm install | `/recovery-manager` | Recovery (flat handler, no `handlers/`) |
| `sites` | node-22 | 300 | npm install | `/sites` | Sites, health AI |
| `stripe-api` | node-22 | 120 | npm install | `/stripe-api` | Billing (Stripe) |
| `support` | node-22 | 30 | npm install | `/support` | Support tickets |
| `uptime-robot` | node-22 | 120 | npm install | `/uptime-robot` | Uptime monitoring |
| `user-mailbox` | node-22 | 120 | npm install | `/user-mailbox` | Admin mailbox (IMAP) |
| `users` | node-22 | 120 | npm install | `/users` | Teams, users |
| `wp-proxy` | node-22 | 120 | npm install | `/wp-proxy` | WordPress proxy / ZIP installs |

All functions share VCS: `installationId: 69e016afb5c72c7bf95c`, branch `main`, repo `1253976054`.

**Extra deps (beyond shared):** `library` → adm-zip · `stripe-api` → stripe · `user-mailbox` → imapflow, nodemailer, mailparser · `recovery-manager` → jsonwebtoken.

---

## Clone

```bash
git clone https://github.com/wphub-pro/functions functions
```

See [WORKSPACE.md](WORKSPACE.md).

---

## Monorepo scripts

| Script | Purpose |
|--------|---------|
| `functions/scripts/function-ids.mjs` | Canonical list of 12 function ids |
| `functions/scripts/bootstrap-node-functions.mjs` | Scaffold function package files |
| `functions/scripts/codemod-node-imports.mjs` | Migrate imports to `@code045/wphubpro-shared` |

See `functions/README.md` and `functions/DEPLOY.md` in the functions clone.
