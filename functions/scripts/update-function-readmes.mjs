#!/usr/bin/env node
/** Update per-function README deploy/runtime section. */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDS = [
  'bridge', 'library', 'messaging', 'platform-settings', 'recovery-manager',
  'sites', 'stripe-api', 'support', 'uptime-robot', 'user-mailbox', 'users', 'wp-proxy',
];

const buildCommands = (id) =>
  id === 'user-mailbox'
    ? '`pnpm install && pnpm run build && node scripts/patch-npm-os-hostname.mjs`'
    : '`pnpm install && pnpm run build`';

const deployBlock = (id) => `## Appwrite Git deploy

| Setting | Value |
|--------|--------|
| Provider root directory | \`functions/${id}\` |
| Entrypoint | \`dist/main.js\` |
| Build commands | ${buildCommands(id)} |
| Runtime | Node.js 22 |

**shared:** \`@code045/wphubpro-shared@1.0.10\` (direct import)`;

for (const id of IDS) {
  const p = join(root, id, 'README.md');
  try {
    let s = readFileSync(p, 'utf8');
    s = s.replace(
      /## Appwrite Git deploy[\s\S]*?(?=\n\*\*Actions:|\n\*\*Local:|\n\*\*shared \*\*|\n$)/,
      `${deployBlock(id)}\n\n`,
    );
    s = s.replace(
      /(\*\*shared:\*\* `@code045\/wphubpro-shared@1\.0\.10` \(direct import\)\n)+/g,
      '**shared:** `@code045/wphubpro-shared@1.0.10` (direct import)\n\n',
    );
    s = s.replace(
      /\*\*shared:\*\* published npm `@code045\/wphubpro-shared`[^\n]*\n?/g,
      '',
    );
    // Fix user-mailbox local section
    if (id === 'user-mailbox') {
      s = s.replace(
        /\*\*Local:\*\*\n\n```bash\n[\s\S]*?```\n\n`node_modules\/` must ship with deploy \(not in `\.appwriteignore`\)\.\n?/,
        `**Local:**\n\n\`\`\`bash\ncd functions/user-mailbox\npnpm install\npnpm run build\nnode scripts/patch-npm-os-hostname.mjs\n\`\`\`\n\n`,
      );
    }
    writeFileSync(p, s);
    console.log('[readme]', id);
  } catch (err) {
    console.error('[readme]', id, err.message);
  }
}
