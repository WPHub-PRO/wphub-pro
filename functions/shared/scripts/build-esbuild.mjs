#!/usr/bin/env node
/**
 * Bundle shared library to mod.js for Node.js Appwrite runtime / npm publish.
 */
import * as esbuild from 'esbuild';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const sharedRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(sharedRoot, 'mod.ts');
const outfile = join(sharedRoot, 'mod.js');

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  target: 'node22',
  sourcemap: true,
  packages: 'external',
  logLevel: 'info',
});

console.log(`[build-esbuild] wrote ${outfile}`);
