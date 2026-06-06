#!/usr/bin/env node
/**
 * npm deps (pino via imapflow, nodemailer) call os.hostname() at load time.
 * Run after `pnpm run build` on Appwrite Node.js 22.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nmRoot = path.join(root, 'node_modules');
const loggerStub = fs.readFileSync(path.join(root, 'lib', 'imapflow-logger-stub.cjs'), 'utf8');

if (!fs.existsSync(nmRoot)) {
  console.warn('[patch-npm-os-hostname] skip: no node_modules (run pnpm install first)');
  process.exit(0);
}

const HOST = "'wphub-function'";
let hostnamePatches = 0;
let loggerPatches = 0;

function walk(dir, onFile) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === '.git') continue;
      walk(p, onFile);
      continue;
    }
    onFile(p);
  }
}

walk(nmRoot, (p) => {
  if (!p.endsWith('.js') && !p.endsWith('.cjs')) return;
  if (!fs.statSync(p).isFile()) return;
  let s = fs.readFileSync(p, 'utf8');
  const next = s.replace(/os\.hostname\(\)/g, HOST);
  if (next !== s) {
    fs.writeFileSync(p, next);
    hostnamePatches += 1;
  }
});

walk(nmRoot, (p) => {
  if (!p.includes(`${path.sep}imapflow${path.sep}`)) return;
  if (!p.endsWith(`${path.sep}lib${path.sep}logger.js`)) return;
  if (!fs.statSync(p).isFile()) return;
  fs.writeFileSync(p, loggerStub);
  loggerPatches += 1;
});

console.log(
  `[patch-npm-os-hostname] hostname patches: ${hostnamePatches}, imapflow logger stubs: ${loggerPatches}`,
);
