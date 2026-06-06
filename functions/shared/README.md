# @code045/wphubpro-shared

Private npm package — shared TypeScript library for WP Hub Pro Appwrite **Node.js 22** functions.

## Consumption (Node functions)

Each function declares in `package.json`:

```json
"@code045/wphubpro-shared": "*.*.**"
```

Handlers import directly:

```ts
import { ok, fail, createServerClients } from '@code045/wphubpro-shared';
```

Runtime entry: **`mod.js`** (esbuild bundle). Types: **`mod.ts`** / `src/**`.

## Local development (monorepo)

From `functions/` root with pnpm workspace, or pack locally:

```bash
cd shared && npm run build && npm pack
```

## Publish (maintainers)

From `shared/`:

```bash
npm run build
npm login
npm publish --access restricted
```

Bump `version` in `package.json` and the pin in all function `package.json` files before redeploying.

## Build

```bash
cd functions/shared
npm install
npm run build   # esbuild → mod.js
```

## Publish workflow

When changing `src/**`: bump version, `npm run build`, `npm publish --access restricted`, update function pins
