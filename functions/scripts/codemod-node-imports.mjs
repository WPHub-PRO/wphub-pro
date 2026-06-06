#!/usr/bin/env node
/**
 * Codemod: normalize import conventions for function sources.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FUNCTION_IDS = [
  'bridge', 'library', 'messaging', 'platform-settings', 'recovery-manager',
  'sites', 'stripe-api', 'support', 'uptime-robot', 'user-mailbox', 'users', 'wp-proxy',
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(p, files);
    } else if (p.endsWith('.ts') || p.endsWith('.js')) {
      files.push(p);
    }
  }
  return files;
}

function transform(content, filePath) {
  let s = content;
  // functionsLib barrel → shared package
  s = s.replace(/from ['"](\.\.\/)+lib\/functionsLib\.ts['"]/g, "from '@code045/wphubpro-shared'");
  s = s.replace(/from ['"]\.\/functionsLib\.ts['"]/g, "from '@code045/wphubpro-shared'");
  s = s.replace(/from ['"]\.\/lib\/functionsLib\.ts['"]/g, "from '@code045/wphubpro-shared'");
  // node-appwrite type imports → shared
  s = s.replace(
    /import type \{([^}]+)\} from ['"]node-appwrite['"]/g,
    "import type {$1} from '@code045/wphubpro-shared'",
  );
  // npm: specifiers → package names
  s = s.replace(/from ['"]npm:stripe@[^'"]+['"]/g, "from 'stripe'");
  s = s.replace(/from ['"]npm:jsonwebtoken@[^'"]+['"]/g, "from 'jsonwebtoken'");
  s = s.replace(/from ['"]npm:adm-zip@[^'"]+['"]/g, "from 'adm-zip'");
  s = s.replace(/from ['"]npm:mailparser@[^'"]+['"]/g, "from 'mailparser'");
  s = s.replace(/from ['"]npm:imapflow@[^'"]+['"]/g, "from 'imapflow'");
  s = s.replace(/from ['"]npm:nodemailer@[^'"]+['"]/g, "from 'nodemailer'");
  // Relative .ts imports → .js (NodeNext)
  s = s.replace(/from (['"])(\.\.?\/[^'"]+)\.ts\1/g, 'from $1$2.js$1');
  // Deno main.ts comments
  if (filePath.endsWith('/main.ts')) {
    s = s.replace(/^\/\*\* Appwrite Deno entry[^\n]*\n \*[^\n]*\n \*\/\n/, '');
    s = s.replace(/^\/\*\* Appwrite Deno entry[^\n]*\n \*\/\n/, '');
  }
  // Remove 'use strict'
  s = s.replace(/^['"]use strict['"];\n\n?/m, '');
  return s;
}

for (const id of FUNCTION_IDS) {
  const dir = join(root, id);
  for (const file of walk(dir)) {
    if (file.includes('/lib/functionsLib.ts')) continue;
    const orig = readFileSync(file, 'utf8');
    const next = transform(orig, file);
    if (next !== orig) {
      writeFileSync(file, next);
      console.log('[codemod]', file.replace(root + '/', ''));
    }
  }
  const barrel = join(dir, 'lib', 'functionsLib.ts');
  try {
    unlinkSync(barrel);
    console.log('[removed]', barrel.replace(root + '/', ''));
  } catch {
    /* no barrel */
  }
}

console.log('[codemod] done');
