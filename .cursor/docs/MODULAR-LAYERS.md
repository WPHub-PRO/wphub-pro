# Modular layers (app + Appwrite functions)

## App (`sites/wphubpro/src/domains/<domain>/`)

**17 domains:** `admin`, `auth`, `billing`, `bridge`, `docs`, `library`, `mailbox`, `notification-templates`, `notifications`, `platform`, `platform-events`, `profile`, `sites`, `system-email`, `teams`, `tickets`, `workspace`.

| File | Role |
|------|------|
| `types.ts` | DTOs / document shapes |
| `api.ts` | `executeFunction` calls + action name constants |
| `queries.ts` | Client-safe `Query[]` + thin `fetch*` via `databases` |
| `mappers.ts` | Document → view model |
| `queryKeys.ts` | React Query key factories |
| `hooks/` or `hooks.ts` | `useQuery` / `useMutation` only |
| `index.ts` | Public barrel exports |

**Function integration:** all server-side calls go through **`src/integrations/appwrite/executeFunction.ts`** (`functions.createExecution`). Domains wrap it in `api.ts`:

```ts
import { executeFunction } from '@/integrations/appwrite/executeFunction';
import { APPWRITE_FUNCTION_IDS } from '@/services/appwrite';

export function supportFunction<T>(action: string, body: Record<string, unknown> = {}) {
  return executeFunction<T>(APPWRITE_FUNCTION_IDS.SUPPORT, { action, ...body });
}
```

**Rules**

- Views import from `@/domains/<domain>` only — no raw `Query` in JSX.
- Privileged reads (inbox, admin) → function + `api.ts` only.
- Session-scoped reads → `queries.ts` + row permissions.
- Resource ids from `@/services/appwrite` (backed by `wphubAppwriteIds.ts` + `generated/appwrite/`).

**Other integration entry points**

| Path | Role |
|------|------|
| `src/lib/stripe-loader.ts` | Stripe via `stripe-api` function |
| `src/lib/platform-api.ts` | Long-running `wp-proxy` / bridge calls |

---

## Functions (`functions/<id>/`)

| File | Role |
|------|------|
| `handler.ts` | Env, auth, `ctx`, action dispatch |
| `handlers/<action>.ts` | Validate → service → `ok`/`fail` |
| `lib/services/` | Use-cases (no `res`) |
| `lib/queries/` | Query builders (function-local only) |
| `package.json` | `@code045/wphubpro-shared` + deps |

**Rules**

- New cross-function logic → **`functions/shared/`** first ([SHARED.md](SHARED.md)).
- Import shared via **`@code045/wphubpro-shared`** — not `functionsLib.ts` or relative paths into `shared/`.
- Node.js + TypeScript — verify with `pnpm run build` in `functions/<id>/`.
- One function id = one deploy unit.

---

## `@code045/wphubpro-shared` (`functions/shared/`)

Shared: env, HTTP, ids, notifications, workspace auth, bridge release, query builders. See [SHARED.md](SHARED.md).

---

## Cleanup (every PR)

1. Grep before moving code; delete `lib/` files with zero imports.
2. No duplicate query blocks beside `queries.ts` / `lib/queries/`.
3. Run `npm run build` + `lint` in `sites/wphubpro` when touching app.
4. Run `pnpm run build` for touched function ids.

---

## App ↔ function map

| UI domain | Function `$id` |
|-----------|----------------|
| notifications, system-email, notification-templates | messaging |
| tickets | support |
| sites | sites |
| library, WP install | library, wp-proxy |
| billing | stripe-api |
| teams, users, workspace | users |
| platform, platform-events | platform-settings, messaging |
| bridge | bridge, wp-proxy |
| uptime | uptime-robot |
| admin mailbox | user-mailbox |
| auth, profile, admin | users (+ direct DB where permitted) |

See [FUNCTIONS.md](FUNCTIONS.md).
