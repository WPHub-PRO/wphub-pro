#!/usr/bin/env node
/**
 * Restore Appwrite function Git (VCS) settings from appwrite.config.json.
 *
 * `appwrite push functions` does not sync VCS fields; `appwrite functions update`
 * without provider flags clears Git. Run this after push or partial updates.
 *
 * Usage (from anywhere in workspace):
 *   node .cursor/scripts/restore-function-vcs.js
 *   node .cursor/scripts/restore-function-vcs.js --dry-run
 *   node .cursor/scripts/restore-function-vcs.js --function-id bridge
 *   node .cursor/scripts/restore-function-vcs.js --check
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CURSOR_ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(CURSOR_ROOT, 'appwrite.config.json');

function parseArgs(argv) {
  const opts = { dryRun: false, check: false, functionIds: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--check') opts.check = true;
    else if (a === '--function-id' || a === '-f') {
      const id = argv[++i];
      if (!id) throw new Error('Missing value for --function-id');
      opts.functionIds.push(id);
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: node .cursor/scripts/restore-function-vcs.js [options]

Options:
  --dry-run              Print appwrite commands without running them
  --check                Report functions whose remote VCS differs from config
  --function-id, -f ID   Restore only this function $id (repeatable)
  --help, -h             Show this help

Requires: appwrite CLI logged in; run appwrite from .cursor/ (config cwd).`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Config not found: ${CONFIG_PATH}`);
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  if (!Array.isArray(config.functions)) {
    console.error('appwrite.config.json has no functions[] array');
    process.exit(1);
  }
  return config.functions;
}

function boolFlag(value) {
  return value ? 'true' : 'false';
}

/** Build CLI args for appwrite functions update from config row. */
function buildUpdateArgs(fn) {
  const id = fn.$id;
  if (!id) throw new Error('Function missing $id in appwrite.config.json');

  const args = [
    'functions',
    'update',
    '--function-id',
    id,
    '--name',
    fn.name || id,
    '--runtime',
    fn.runtime,
    '--timeout',
    String(fn.timeout ?? 15),
    '--entrypoint',
    fn.entrypoint || 'main.ts',
    '--commands',
    fn.commands ?? '',
  ];

  if (fn.schedule) args.push('--schedule', fn.schedule);
  if (fn.runtimeSpecification) args.push('--specification', fn.runtimeSpecification);

  args.push('--enabled', boolFlag(fn.enabled !== false));
  args.push('--logging', boolFlag(fn.logging !== false));

  for (const role of fn.execute || []) {
    args.push('--execute', role);
  }
  for (const event of fn.events || []) {
    args.push('--events', event);
  }
  for (const scope of fn.scopes || []) {
    args.push('--scopes', scope);
  }

  const installationId = fn.installationId;
  const repoId = fn.providerRepositoryId;
  const branch = fn.providerBranch;
  const rootDir = fn.providerRootDirectory;

  if (!installationId || !repoId || !branch || !rootDir) {
    return { skip: true, reason: 'missing VCS fields in appwrite.config.json', id };
  }

  args.push(
    '--installation-id',
    installationId,
    '--provider-repository-id',
    String(repoId),
    '--provider-branch',
    branch,
    '--provider-root-directory',
    rootDir,
    '--provider-silent-mode',
    boolFlag(Boolean(fn.providerSilentMode)),
  );

  return { skip: false, id, args };
}

function runAppwrite(args) {
  const result = spawnSync('appwrite', args, {
    cwd: CURSOR_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return result;
}

function getRemoteFunction(id) {
  const result = runAppwrite(['functions', 'get', '--function-id', id, '--json']);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `functions get failed for ${id}`);
  }
  return JSON.parse(result.stdout);
}

function vcsMatchesConfig(remote, fn) {
  return (
    String(remote.installationId || '') === String(fn.installationId || '') &&
    String(remote.providerRepositoryId || '') === String(fn.providerRepositoryId || '') &&
    String(remote.providerBranch || '') === String(fn.providerBranch || '') &&
    String(remote.providerRootDirectory || '') === String(fn.providerRootDirectory || '')
  );
}

function main() {
  const opts = parseArgs(process.argv);
  let functions = loadConfig();

  if (opts.functionIds.length > 0) {
    functions = functions.filter((f) => opts.functionIds.includes(f.$id));
    const missing = opts.functionIds.filter((id) => !functions.some((f) => f.$id === id));
    if (missing.length) {
      console.error(`Unknown function id(s) in config: ${missing.join(', ')}`);
      process.exit(1);
    }
  }

  if (opts.check) {
    let needsRestore = 0;
    for (const fn of functions) {
      const { skip, reason, id } = buildUpdateArgs(fn);
      if (skip) {
        console.log(`[skip] ${id}: ${reason}`);
        continue;
      }
      let remote;
      try {
        remote = getRemoteFunction(id);
      } catch (e) {
        console.log(`[error] ${id}: ${e.message}`);
        needsRestore++;
        continue;
      }
      if (vcsMatchesConfig(remote, fn)) {
        console.log(`[ok] ${id}: VCS matches config`);
      } else {
        console.log(
          `[drift] ${id}: remote installationId=${remote.installationId || '(empty)'} ` +
            `repo=${remote.providerRepositoryId || '(empty)'} ` +
            `branch=${remote.providerBranch || '(empty)'} ` +
            `root=${remote.providerRootDirectory || '(empty)'}`,
        );
        needsRestore++;
      }
    }
    process.exit(needsRestore > 0 ? 2 : 0);
  }

  let ok = 0;
  let failed = 0;
  let skipped = 0;

  for (const fn of functions) {
    const built = buildUpdateArgs(fn);
    if (built.skip) {
      console.log(`[skip] ${built.id}: ${built.reason}`);
      skipped++;
      continue;
    }

    const cmd = ['appwrite', ...built.args].join(' ');
    if (opts.dryRun) {
      console.log(`[dry-run] ${cmd}`);
      ok++;
      continue;
    }

    console.log(`[restore] ${built.id} …`);
    const result = runAppwrite(built.args);
    if (result.status === 0) {
      console.log(`[ok] ${built.id}`);
      ok++;
    } else {
      console.error(`[fail] ${built.id}\n${result.stderr || result.stdout}`);
      failed++;
    }
  }

  console.log(`\nDone: ${ok} ok, ${failed} failed, ${skipped} skipped`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
