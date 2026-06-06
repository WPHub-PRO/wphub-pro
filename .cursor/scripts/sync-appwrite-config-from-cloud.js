#!/usr/bin/env node
/**
 * Pull Appwrite cloud settings into appwrite.config.json.
 *
 * Syncs:
 *   - tables + tablesDB  → appwrite pull tables
 *   - buckets            → appwrite pull buckets
 *   - functions (metadata + VCS, no code/vars) → appwrite functions list --json
 *
 * Local `path` values on functions are preserved.
 *
 * Usage (from repo root):
 *   node .cursor/scripts/sync-appwrite-config-from-cloud.js
 *   node .cursor/scripts/sync-appwrite-config-from-cloud.js --dry-run
 *   node .cursor/scripts/sync-appwrite-config-from-cloud.js --only tables,buckets
 *
 * CI / headless (set before running):
 *   appwrite client --endpoint <URL> --project-id wphub-pro --key <API_KEY>
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const CONFIG_PATH = path.join(REPO_ROOT, 'appwrite.config.json');

const FUNCTION_SYNC_KEYS = [
  'name',
  'runtime',
  'entrypoint',
  'execute',
  'enabled',
  'logging',
  'events',
  'schedule',
  'timeout',
  'commands',
  'scopes',
  'buildSpecification',
  'runtimeSpecification',
  'deploymentRetention',
  'installationId',
  'providerRepositoryId',
  'providerBranch',
  'providerRootDirectory',
  'providerSilentMode',
  'providerBranches',
  'providerPaths',
];

function parseArgs(argv) {
  const opts = { dryRun: false, only: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--only') {
      const v = argv[++i];
      if (!v) throw new Error('Missing value for --only');
      opts.only = new Set(v.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a === '--help' || a === '-h') {
      console.log(`Usage: node .cursor/scripts/sync-appwrite-config-from-cloud.js [options]

Options:
  --dry-run           Preview function merges without writing appwrite.config.json
  --only <list>       Comma-separated: tables, buckets, functions (default: all)
  --help, -h          Show this help

Requires: Appwrite CLI logged in, or appwrite client --key for CI.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return opts;
}

function shouldRun(opts, section) {
  return !opts.only || opts.only.has(section);
}

function runAppwrite(args, input) {
  const result = spawnSync('appwrite', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || '').trim();
    throw new Error(`appwrite ${args.join(' ')} failed: ${msg}`);
  }
  return result.stdout;
}

function pullTables() {
  console.log('[pull] tables …');
  runAppwrite(['pull', 'tables'], 'a\n');
  console.log('[ok] tables');
}

function pullBuckets() {
  console.log('[pull] buckets …');
  runAppwrite(['pull', 'buckets']);
  console.log('[ok] buckets');
}

function syncFunctions(opts) {
  console.log('[sync] functions (metadata + VCS) …');
  const stdout = runAppwrite(['functions', 'list', '--json']);
  const remote = JSON.parse(stdout);
  const byId = new Map(remote.functions.map((f) => [f.$id, f]));

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  if (!Array.isArray(config.functions)) {
    throw new Error('appwrite.config.json has no functions[] array');
  }

  let merged = 0;
  let added = 0;
  const seen = new Set();

  for (const fn of config.functions) {
    const remoteFn = byId.get(fn.$id);
    if (!remoteFn) {
      console.warn(`[warn] ${fn.$id}: not found in cloud — keeping local entry`);
      continue;
    }
    seen.add(fn.$id);
    const preservedPath = fn.path;
    for (const key of FUNCTION_SYNC_KEYS) {
      if (remoteFn[key] !== undefined && remoteFn[key] !== null && remoteFn[key] !== '') {
        fn[key] = remoteFn[key];
      }
    }
    if (preservedPath) fn.path = preservedPath;
    merged++;
  }

  for (const remoteFn of remote.functions) {
    if (seen.has(remoteFn.$id)) continue;
    const entry = { $id: remoteFn.$id, path: `functions/${remoteFn.$id}` };
    for (const key of FUNCTION_SYNC_KEYS) {
      if (remoteFn[key] !== undefined && remoteFn[key] !== null && remoteFn[key] !== '') {
        entry[key] = remoteFn[key];
      }
    }
    config.functions.push(entry);
    added++;
    console.log(`[add] ${remoteFn.$id}: new function from cloud`);
  }

  if (opts.dryRun) {
    console.log(`[dry-run] would merge ${merged} functions, add ${added}`);
    return;
  }

  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 4)}\n`);
  console.log(`[ok] functions: merged ${merged}, added ${added}`);
}

function main() {
  const opts = parseArgs(process.argv);
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Config not found: ${CONFIG_PATH}`);
    process.exit(1);
  }

  const before = fs.readFileSync(CONFIG_PATH, 'utf8');

  try {
    if (shouldRun(opts, 'tables')) pullTables();
    if (shouldRun(opts, 'buckets')) pullBuckets();
    if (shouldRun(opts, 'functions')) syncFunctions(opts);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (opts.dryRun) {
    console.log('\nDone (dry-run). tables/buckets may already be written by CLI pull.');
    process.exit(0);
  }

  const after = fs.readFileSync(CONFIG_PATH, 'utf8');
  if (before === after) {
    console.log('\nNo changes to appwrite.config.json.');
  } else {
    console.log('\nappwrite.config.json updated.');
  }
}

main();
