#!/usr/bin/env node
/** Codemod shared package: .ts import extensions → .js for Node/tsc. */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules') continue;
      walk(p, files);
    } else if (p.endsWith('.ts')) {
      files.push(p);
    }
  }
  return files;
}

for (const file of walk(root)) {
  const orig = readFileSync(file, 'utf8');
  const next = orig.replace(/from (['"])(\.\.?\/[^'"]+)\.ts\1/g, 'from $1$2.js$1');
  if (next !== orig) writeFileSync(file, next);
}

console.log('[shared-codemod] done');
