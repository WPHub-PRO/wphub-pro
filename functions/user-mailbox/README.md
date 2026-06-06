# Appwrite function: `user-mailbox`

Part of the WP Hub functions monorepo. Handler path: `functions/user-mailbox/`.

## Appwrite Git deploy

| Setting | Value |
|--------|--------|
| Provider root directory | `functions/user-mailbox` |
| Entrypoint | `dist/main.js` |
| Build commands | `pnpm install && pnpm run build && node scripts/patch-npm-os-hostname.mjs` |
| Runtime | Node.js 22 |

**shared:** `@code045/wphubpro-shared@1.0.10` (direct import)



**shared:** `@code045/wphubpro-shared@1.0.10` (direct import)




**Local:**

```bash
cd functions/user-mailbox
pnpm install
pnpm run build
node scripts/patch-npm-os-hostname.mjs
```

