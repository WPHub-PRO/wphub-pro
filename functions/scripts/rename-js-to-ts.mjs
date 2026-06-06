#!/usr/bin/env node
/** One-off: rename .js source files to .ts in function folders. */
import { renameSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDS = ['messaging', 'stripe-api', 'platform-settings', 'support', 'uptime-robot', 'recovery-manager'];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === 'scripts') continue;
      walk(p, files);
    } else if (p.endsWith('.js') && !p.endsWith('.cjs')) {
      files.push(p);
    }
  }
  return files;
}

for (const id of IDS) {
  for (const file of walk(join(root, id))) {
    const ts = file.replace(/\.js$/, '.ts');
    renameSync(file, ts);
    console.log('[rename]', file.replace(root + '/', ''), '→', ts.replace(root + '/', ''));
  }
}

console.log('[rename] done');
