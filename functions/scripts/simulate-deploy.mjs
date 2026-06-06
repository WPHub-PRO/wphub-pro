#!/usr/bin/env node
/**
 * Simulates Appwrite messaging deploy resolution (debug session 640ce1).
 * Run from functions repo root: node scripts/simulate-deploy.mjs
 */
import { existsSync, rmSync, mkdirSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const LOG = join(REPO_ROOT, '..', '.cursor', 'debug-640ce1.log');
const ENDPOINT = 'http://127.0.0.1:7629/ingest/b297929a-c060-495f-a7b3-50bd43537cc1';
const SESSION = '640ce1';

function log(hypothesisId, message, data) {
  const entry = {
    sessionId: SESSION,
    hypothesisId,
    location: 'scripts/simulate-deploy.mjs',
    message,
    data,
    timestamp: Date.now(),
    runId: 'simulate',
  };
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION },
    body: JSON.stringify(entry),
  }).catch(() => {});
}

const scenarios = [
  {
    id: 'H1',
    label: 'wphubpro config path functions/messaging (wrong for functions-only repo)',
    cwd: REPO_ROOT,
    deployRoot: join(REPO_ROOT, 'functions', 'messaging'),
    main: join(REPO_ROOT, 'functions', 'messaging', 'main.ts'),
    denoJson: join(REPO_ROOT, 'deno.json'),
  },
  {
    id: 'H2',
    label: 'correct functions-repo root + messaging/main.ts',
    cwd: REPO_ROOT,
    deployRoot: REPO_ROOT,
    main: join(REPO_ROOT, 'messaging', 'main.ts'),
    denoJson: join(REPO_ROOT, 'deno.json'),
  },
  {
    id: 'H3',
    label: 'per-function path messaging only (no parent deno.json)',
    cwd: join(REPO_ROOT, 'messaging'),
    deployRoot: join(REPO_ROOT, 'messaging'),
    main: join(REPO_ROOT, 'messaging', 'main.ts'),
    denoJson: join(REPO_ROOT, 'deno.json'),
  },
  {
    id: 'H5',
    label: 'runtime without deno.json — bare @code045 import (Appwrite execute)',
    cwd: REPO_ROOT,
    deployRoot: REPO_ROOT,
    main: join(REPO_ROOT, 'messaging', 'main.ts'),
    denoJson: join(REPO_ROOT, 'deno.json'),
    runtimeOnly: true,
  },
];

for (const s of scenarios) {
  const deployRootExists = existsSync(s.deployRoot);
  const mainExists = existsSync(s.main);
  const denoInDeployRoot = existsSync(join(s.deployRoot, 'deno.json'));
  const denoAtRepoRoot = existsSync(s.denoJson);
  const sharedInDeployRoot = existsSync(join(s.deployRoot, 'shared'));
  const sharedAtRepoRoot = existsSync(join(REPO_ROOT, 'shared'));

  log(s.id, s.label, {
    deployRootExists,
    mainExists,
    denoInDeployRoot,
    denoAtRepoRoot,
    sharedInDeployRoot,
    sharedAtRepoRoot,
    cwd: s.cwd,
  });

  if (!mainExists) {
    log(s.id, 'skip deno cache — main.ts missing', {});
    continue;
  }

  const denoJsonFlag = denoInDeployRoot
    ? []
    : denoAtRepoRoot
      ? ['-c', s.denoJson]
      : [];

  const r = spawnSync('deno', ['cache', ...denoJsonFlag, '--quiet', s.main], {
    cwd: s.cwd,
    encoding: 'utf8',
  });

  log(s.id, 'deno cache result', {
    exitCode: r.status,
    stderr: (r.stderr || '').slice(0, 500),
    stdout: (r.stdout || '').slice(0, 200),
    usedDenoJson: denoJsonFlag.join(' ') || '(auto)',
  });

  if (s.runtimeOnly) {
    const tmp = join(REPO_ROOT, '.tmp-runtime-sim');
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(join(tmp, 'messaging', 'lib'), { recursive: true });
    cpSync(join(REPO_ROOT, 'messaging', 'main.ts'), join(tmp, 'messaging', 'main.ts'));
    cpSync(join(REPO_ROOT, 'messaging', 'handler.js'), join(tmp, 'messaging', 'handler.js'));
    cpSync(
      join(REPO_ROOT, 'messaging', 'lib', 'functionsLib.ts'),
      join(tmp, 'messaging', 'lib', 'functionsLib.ts'),
    );
    if (existsSync(join(REPO_ROOT, 'node_modules'))) {
      cpSync(join(REPO_ROOT, 'node_modules'), join(tmp, 'node_modules'), { recursive: true });
    }
    if (existsSync(join(REPO_ROOT, 'package.json'))) {
      cpSync(join(REPO_ROOT, 'package.json'), join(tmp, 'package.json'));
    }
    const run = spawnSync('deno', ['run', '--allow-all', 'messaging/main.ts'], {
      cwd: tmp,
      encoding: 'utf8',
    });
    log(s.id, 'runtime deno run (no deno.json)', {
      exitCode: run.status,
      stderr: (run.stderr || '').slice(0, 500),
      hasNodeModules: existsSync(join(tmp, 'node_modules')),
      hasPackageJson: existsSync(join(tmp, 'package.json')),
    });
  }
}

console.log('Simulation complete. See .cursor/debug-640ce1.log');
