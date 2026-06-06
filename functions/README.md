# WP Hub Pro — Appwrite functions (monorepo)

All 12 serverless functions and shared **`@code045/wphubpro-shared`** npm library in one repository.

## Layout

```text
/
  pnpm-workspace.yaml    # local monorepo (optional)
  shared/                # @code045/wphubpro-shared (npm package source)
  types/                 # shared TypeScript shims for local dev
  bridge/
  support/
  users/
  …
  scripts/
    bootstrap-node-functions.mjs
    codemod-node-imports.mjs
```

Each function is **Node.js 22 + TypeScript + pnpm**:

- `package.json` — `@code045/wphubpro-shared@1.0.10` + function-specific deps
- `main.ts` → compiles to `dist/main.js` (Appwrite entrypoint)
- `handler.ts`, `handlers/`, `lib/`

Import shared helpers directly:

```ts
import { ok, fail, createServerClients } from '@code045/wphubpro-shared';
```

## Local check

```bash
cd functions/<id>
pnpm install
pnpm run build
```

Or from monorepo root:

```bash
cd functions && pnpm install && cd users && pnpm run build
```

`user-mailbox` also runs `node scripts/patch-npm-os-hostname.mjs` after build (see `appwrite.config.json`).

## Deploy

From **`.cursor/`** (Appwrite config cwd):

```bash
cd .cursor
appwrite push functions
```

Each function: `path: ../functions/<id>`, `runtime: node-22`, `entrypoint: dist/main.js`, `commands: pnpm install && pnpm run build`.

See [`DEPLOY.md`](DEPLOY.md).

## @code045/wphubpro-shared

Publish from `shared/` — see [`shared/README.md`](shared/README.md).

Docs: [`.cursor/docs/FUNCTIONS.md`](../.cursor/docs/FUNCTIONS.md) · [`.cursor/docs/SHARED.md`](../.cursor/docs/SHARED.md)
