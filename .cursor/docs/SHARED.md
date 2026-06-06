# @code045/wphubpro-shared

Shared npm library for all Appwrite Node functions. **Source:** `functions/shared/` in the monorepo. **Published:** `@code045/wphubpro-shared` on npm (restricted).

**Related:** [FUNCTIONS.md](FUNCTIONS.md) · [AGENTS.md](AGENTS.md)

---

## Consumption (in function handlers)

Each function **`package.json`** pins the package. Current source version: **1.0.11** (`functions/shared/package.json`). Function pins may differ until synced — see **`wphub-shared-publish.mdc`**.

```json
"@code045/wphubpro-shared": "1.0.11"
```

Handlers import directly:

```ts
import { createServerClients, WPHUB_APPWRITE_IDS, ok, fail, Query } from '@code045/wphubpro-shared';
```

**Do not** import `functions/shared/src/**` in function handler code — always **`@code045/wphubpro-shared`** only.

**Do not** use `functionsLib.ts` — removed; import from `@code045/wphubpro-shared`.

Deploy: set **`NPM_TOKEN`** on Appwrite for restricted npm.

---

## Package layout

| Path | Role |
|------|------|
| `mod.ts` | Public API barrel (types entry) |
| `mod.js` | Runtime bundle (esbuild; gitignored until built) |
| `src/appwrite/` | Client, auth, ids (`WPHUB_APPWRITE_IDS`) |
| `src/core/` | env, config, strings |
| `src/http/` | payload, ok/fail, runtime |
| `src/workspace/` | team auth, context |
| `src/queries/` | Query builders (notifications, tickets, sites, library, platformSettings) |
| `src/email/` | system + transactional email |
| `src/notifications/` | inbox, templates, recipients |
| `src/platform/` | settings, events |
| `src/bridge/` | bridge release, auth |

Build: `npm run build` (esbuild → `mod.js`, node-appwrite and other deps external).

---

## node-appwrite

| Context | Rule |
|---------|------|
| **Handlers** | Import `Query`, `ID`, `Client`, etc. from `@code045/wphubpro-shared` |
| **shared/src/** | May import `node-appwrite` internally |

Create clients with **`createServerClients`** / **`createServerClientAndDatabases`**. Pass **`req`** into APIs that accept it.

---

## Local dev

```bash
cd functions/shared
npm install && npm run build
```

Then in a function folder: `npm install && npm run build` (or `pnpm` for `messaging`).

For IDE types without npm install, `functions/types/wphubpro-shared.d.ts` provides a minimal shim.

---

## Publish workflow

When changing shared code:

```bash
cd functions/shared
npm run build
npm version patch   # or minor/major
npm publish --access restricted
```

1. Bump `version` in `shared/package.json` (via `npm version`).
2. Update **every** version reference — all 12 `functions/<id>/package.json`, `functions/scripts/update-function-readmes.mjs` — see **`wphub-shared-publish.mdc`**.
3. Verify: `rg '@code045/wphubpro-shared'` in `functions/` (no stale pins).
4. Commit monorepo; redeploy via `appwrite push functions`.
5. Sync ids in shared package source when schema ids change — `wphub-appwrite-ids.mdc`.

---

## Query helpers (exported)

| Module | Examples |
|--------|----------|
| `src/queries/tickets.ts` | `ticketsByUserIdQueries`, `ticketsAllQueries` |
| `src/queries/notifications.ts` | `inboxByUserIdQueries`, `notificationReadRowsByUserQueries` |
| `src/queries/sites.ts` | Site list/filter builders |
| `src/queries/library.ts` | Library query builders |
| `src/queries/platformSettings.ts` | Platform settings queries |

Function-local query logic stays in `functions/<id>/lib/queries/` when not shared.
