#!/usr/bin/env node
/**
 * Bootstrap Node/pnpm package infra for all Appwrite functions.
 */
import { writeFileSync, readFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npmrc = readFileSync(join(root, '.npmrc'), 'utf8');

const FUNCTIONS = [
  { id: 'bridge' },
  { id: 'library', deps: { 'adm-zip': '0.5.16' }, devDeps: { '@types/adm-zip': '^0.5.7' } },
  { id: 'messaging' },
  { id: 'platform-settings' },
  {
    id: 'recovery-manager',
    deps: { jsonwebtoken: '9.0.2' },
    devDeps: { '@types/jsonwebtoken': '^9.0.9' },
  },
  { id: 'sites' },
  { id: 'stripe-api', deps: { stripe: '17.7.0' } },
  { id: 'support' },
  { id: 'uptime-robot' },
  {
    id: 'user-mailbox',
    deps: { imapflow: '1.0.177', nodemailer: '6.9.16', mailparser: '3.7.1' },
    devDeps: { '@types/nodemailer': '^6.4.17' },
  },
  { id: 'users' },
  { id: 'wp-proxy' },
];

const tsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    outDir: 'dist',
    rootDir: '.',
    strict: false,
    skipLibCheck: true,
    esModuleInterop: true,
    declaration: false,
    noCheck: true,
  },
  include: ['**/*.ts'],
  exclude: ['node_modules', 'dist'],
};

const appwriteignore = `*.ts
tsconfig.json
node_modules
scripts
lib/imapflow-logger-stub.cjs
README.md
`;

for (const fn of FUNCTIONS) {
  const dir = join(root, fn.id);
  const deps = {
    '@code045/wphubpro-shared': '1.0.10',
  };
  const devDeps = {
    typescript: '^5.8.0',
    '@types/node': '^22.0.0',
    ...(fn.devDeps || {}),
  };
  const pkg = {
    name: `@wphub/function-${fn.id}`,
    type: 'module',
    private: true,
    engines: { node: '>=22' },
    scripts: {
      build: 'tsc',
      typecheck: 'tsc --noEmit',
    },
    dependencies: deps,
    devDependencies: devDeps,
  };
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2) + '\n');
  writeFileSync(join(dir, '.npmrc'), npmrc);
  writeFileSync(join(dir, '.appwriteignore'), appwriteignore);
  console.log(`[bootstrap] ${fn.id}`);
}

console.log('[bootstrap] done');
