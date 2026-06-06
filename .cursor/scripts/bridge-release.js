/**
 * Zip the bridge plugin (version from wphubpro-bridge.php), upload to Appwrite bucket "bridge",
 * then invoke the unified `bridge` function to set
 * `platform_db` / `bridge` / `current` (archiving the previous `current` to a version-keyed row).
 * Does not write `platform_settings` — the active bridge semver is set manually in admin (`bridge_plugin`).
 * Fails before upload if that version already exists in the bucket or in any `bridge` document.
 * Run from workspace root: node .cursor/scripts/bridge-release.js
 * Requires: .env.local with APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY (or APPWRITE_FUNCTION_API_KEY).
 * Optional: APPWRITE_FUNCTION_BRIDGE (default `bridge`) — function id in Appwrite.
 * Bridge repo: set BRIDGE_DIR in .env or defaults to wphubpro-bridge/ at repo root (nested clone).
 * Tests: runs before any Appwrite calls. Override with BRIDGE_TEST_CMD. Otherwise: npm test if package.json has
 * scripts.test; else npm run test:phpunit if package.json defines script test:phpunit (canonical wp-env + PHPUnit in wphubpro-bridge);
 * else composer test if composer.json has scripts.test; else vendor/bin/phpunit.
 * Zip contents: only paths listed in wphubpro-bridge/bridge-release.include (see that file for glob rules).
 */
import {
  readFileSync,
  mkdtempSync,
  rmSync,
  existsSync,
  mkdirSync,
  statSync,
  copyFileSync,
  readdirSync,
} from 'fs';
import { join, dirname, resolve, basename, relative } from 'path';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '../..');

function getBridgeDir(env) {
  const fromEnv = env.BRIDGE_DIR;
  if (fromEnv) {
    const p = resolve(REPO_ROOT, fromEnv);
    if (existsSync(p)) return p;
    console.error('BRIDGE_DIR not found:', p);
    process.exit(1);
  }
  const nested = join(REPO_ROOT, 'wphubpro-bridge');
  if (existsSync(nested)) return nested;
  console.error(
    'Bridge dir not found. Set BRIDGE_DIR in .env or clone wphubpro-bridge into wphubpro/wphubpro-bridge.',
  );
  process.exit(1);
}

const BUCKET_ID = 'bridge';

/** Must match `functions/bridge/lib/bridgeVersion.js` (wphubpro-bridge-x.y.z.zip). */
function parseVersionFromFileName(name) {
  const m = String(name || '').match(/wphubpro-bridge-(\d+\.\d+\.\d+)\.zip$/i);
  return m ? m[1] : null;
}

/**
 * Fails with a clear Error if the semver is already present in storage and/or the bridge table.
 * Call before zipping or uploading to avoid leaving orphan objects.
 */
async function assertVersionNotReleased(version, env) {
  const endpoint = (env.APPWRITE_ENDPOINT || env.APPWRITE_FUNCTION_ENDPOINT || '').replace(/\/$/, '');
  const projectId = env.APPWRITE_PROJECT_ID || env.APPWRITE_FUNCTION_PROJECT_ID;
  const apiKey = env.APPWRITE_API_KEY || env.APPWRITE_FUNCTION_API_KEY;
  if (!endpoint || !projectId || !apiKey) {
    throw new Error('Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY (or FUNCTION_ variants) in .env');
  }
  const headers = {
    'X-Appwrite-Project': projectId,
    'X-Appwrite-Key': apiKey,
  };

  const expectZip = `wphubpro-bridge-${version}.zip`;
  let offset = 0;
  const limit = 100;
  for (;;) {
    const u = `${endpoint}/storage/buckets/${BUCKET_ID}/files?limit=${limit}&offset=${offset}`;
    const res = await fetch(u, { method: 'GET', headers });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Could not list storage bucket "${BUCKET_ID}": ${res.status} ${t.slice(0, 300)}`);
    }
    const j = await res.json();
    const files = j.files || [];
    for (const f of files) {
      const fromName = parseVersionFromFileName(f.name);
      if (fromName === version) {
        throw new Error(
          `Bridge version ${version} is already in the Appwrite storage bucket (file: "${f.name}"). ` +
            `Use a new semver in the plugin header before publishing.`,
        );
      }
      if (f.name === expectZip) {
        throw new Error(
          `A file named "${expectZip}" already exists in the bridge bucket. Remove it or bump the version.`,
        );
      }
    }
    if (files.length < limit) {
      break;
    }
    offset += limit;
  }

  const qVersion = JSON.stringify({ method: 'equal', attribute: 'version', values: [version] });
  const qLimit = JSON.stringify({ method: 'limit', values: [5] });
  const col = `${endpoint}/databases/platform_db/collections/bridge/documents`;
  const list = await fetch(
    `${col}?queries[]=${encodeURIComponent(qVersion)}&queries[]=${encodeURIComponent(qLimit)}`,
    { method: 'GET', headers: { ...headers, 'Content-Type': 'application/json' } },
  );
  if (!list.ok) {
    const t = await list.text();
    throw new Error(
      `Could not query platform_db/bridge for version: ${list.status} ${t.slice(0, 200)}. ` +
        'If the collection or index is missing, deploy the bridge table from appwrite.config.json.',
    );
  }
  const docList = await list.json();
  const hasAny =
    (Number(docList.total) || 0) > 0 || (Array.isArray(docList.documents) && docList.documents.length > 0);
  if (hasAny) {
    const id = docList.documents?.[0]?.$id;
    const hint = id ? ` (document id: ${id})` : '';
    throw new Error(
      `Bridge version ${version} is already recorded in platform_db/bridge${hint}. ` +
        'The previous release is stored as `current` and/or a history row; bump the plugin version.',
    );
  }
}

function loadEnv() {
  const envPath = join(REPO_ROOT, '.env.local');
  try {
    const content = readFileSync(envPath, 'utf8');
    const env = {};
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return env;
  } catch (e) {
    console.error('Failed to load .env:', e.message);
    process.exit(1);
  }
}

function readBridgeVersion(BRIDGE_DIR) {
  const mainFile = join(BRIDGE_DIR, 'wphubpro-bridge.php');
  const content = readFileSync(mainFile, 'utf8');
  const versionMatch = content.match(/^\s*\*\s*Version:\s*(\d+\.\d+\.\d+)\s*$/m);
  if (!versionMatch) {
    console.error('Could not find Version header in', mainFile);
    process.exit(1);
  }
  const version = versionMatch[1];
  console.log(`Using bridge version ${version} (from plugin header)`);
  return version;
}

function readIncludeManifest(manifestPath) {
  const raw = readFileSync(manifestPath, 'utf8');
  const lines = [];
  for (const line of raw.split('\n')) {
    const t = line.split('#')[0].trim();
    if (t) lines.push(t);
  }
  return lines;
}

function walkFilesRecursive(absDir, onFile) {
  for (const ent of readdirSync(absDir, { withFileTypes: true })) {
    const abs = join(absDir, ent.name);
    if (ent.isDirectory()) {
      walkFilesRecursive(abs, onFile);
    } else if (ent.isFile()) {
      onFile(abs);
    }
  }
}

/**
 * Resolves bridge-release.include lines to repo-relative POSIX paths (under BRIDGE_DIR).
 * Supported: single file path; directory path (all files recursively); path ending in /** (same).
 */
function expandIncludeLineToRelFiles(bridgeDir, line) {
  const rel = line.replace(/\\/g, '/').replace(/\/+$/, '');
  let baseRel = rel;
  if (rel.endsWith('/**')) {
    baseRel = rel.slice(0, -3);
  }
  const absBase = join(bridgeDir, baseRel);
  if (!existsSync(absBase)) {
    throw new Error(`bridge-release.include: path not found: "${line}" (${absBase})`);
  }
  const st = statSync(absBase);
  const out = [];
  if (st.isFile()) {
    if (rel.endsWith('/**')) {
      throw new Error(`bridge-release.include: "${line}" is a file but ends with /**`);
    }
    out.push(baseRel.replace(/\\/g, '/'));
    return out;
  }
  if (!st.isDirectory()) {
    throw new Error(`bridge-release.include: not a file or directory: "${line}"`);
  }
  walkFilesRecursive(absBase, (absFile) => {
    out.push(relative(bridgeDir, absFile).replace(/\\/g, '/'));
  });
  if (out.length === 0) {
    throw new Error(`bridge-release.include: empty directory for pattern "${line}"`);
  }
  return out;
}

function copyBridgeFilesToStaging(bridgeDir, stagingPluginDir, relFiles) {
  const uniq = [...new Set(relFiles)].sort();
  for (const rel of uniq) {
    const from = join(bridgeDir, rel);
    const to = join(stagingPluginDir, rel);
    if (!existsSync(from) || !statSync(from).isFile()) {
      throw new Error(`Internal: expected file missing when copying: ${rel}`);
    }
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
}

function runBridgeTests(BRIDGE_DIR, env) {
  const override = (env.BRIDGE_TEST_CMD || '').trim();
  let cmd = override;
  if (!cmd) {
    const pkgPath = join(BRIDGE_DIR, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : null;
      if (scripts && typeof scripts.test === 'string' && scripts.test.length > 0) {
        cmd = 'npm test';
      } else if (
        scripts &&
        typeof scripts['test:phpunit'] === 'string' &&
        scripts['test:phpunit'].length > 0
      ) {
        cmd = 'npm run test:phpunit';
      }
    }
    if (!cmd) {
      const composerPath = join(BRIDGE_DIR, 'composer.json');
      if (existsSync(composerPath)) {
        const c = JSON.parse(readFileSync(composerPath, 'utf8'));
        if (c.scripts && typeof c.scripts.test === 'string' && c.scripts.test.length > 0) {
          cmd = 'composer test';
        }
      }
    }
    if (!cmd && existsSync(join(BRIDGE_DIR, 'vendor', 'bin', 'phpunit'))) {
      cmd = 'vendor/bin/phpunit';
    }
  }
  if (!cmd) {
    throw new Error(
      'Could not determine bridge test command. Add scripts.test or a test:phpunit script to package.json, ' +
        'composer.json scripts.test, vendor/bin/phpunit, or set BRIDGE_TEST_CMD in .env.local.',
    );
  }
  console.log('Running bridge tests:', cmd);
  execSync(cmd, { stdio: 'inherit', cwd: BRIDGE_DIR, env: process.env, shell: true });
}

function createZip(version, BRIDGE_DIR) {
  const manifestPath = join(BRIDGE_DIR, 'bridge-release.include');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `Missing bridge-release.include in ${BRIDGE_DIR}. ` +
        'Add it listing plugin paths to ship (see wphubpro-bridge/bridge-release.include in the repo).',
    );
  }
  const patterns = readIncludeManifest(manifestPath);
  if (patterns.length === 0) {
    throw new Error(`bridge-release.include is empty: ${manifestPath}`);
  }
  const relFiles = [];
  for (const line of patterns) {
    relFiles.push(...expandIncludeLineToRelFiles(BRIDGE_DIR, line));
  }

  const zipName = `wphubpro-bridge-${version}.zip`;
  const tmpRoot = mkdtempSync(join(tmpdir(), 'bridge-release-'));
  const zipPath = join(tmpRoot, zipName);
  const bridgeDirName = basename(BRIDGE_DIR);
  const stagingPluginDir = join(tmpRoot, 'staging', bridgeDirName);
  mkdirSync(stagingPluginDir, { recursive: true });
  copyBridgeFilesToStaging(BRIDGE_DIR, stagingPluginDir, relFiles);

  const stagingParent = join(tmpRoot, 'staging');
  execSync(`cd "${stagingParent}" && zip -r "${zipPath}" ${bridgeDirName}`, { stdio: 'inherit' });
  rmSync(join(tmpRoot, 'staging'), { recursive: true, force: true });
  return { zipPath, zipName, tmpRoot };
}

async function uploadToAppwrite(zipPath, zipName, env) {
  const endpoint = (env.APPWRITE_ENDPOINT || env.APPWRITE_FUNCTION_ENDPOINT || '').replace(/\/$/, '');
  const projectId = env.APPWRITE_PROJECT_ID || env.APPWRITE_FUNCTION_PROJECT_ID;
  const apiKey = env.APPWRITE_API_KEY || env.APPWRITE_FUNCTION_API_KEY;
  if (!endpoint || !projectId || !apiKey) {
    throw new Error('Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY (or FUNCTION_ variants) in .env');
  }
  const fileId = randomUUID();
  const url = `${endpoint}/storage/buckets/${BUCKET_ID}/files`;
  const body = new FormData();
  const blob = new Blob([readFileSync(zipPath)]);
  body.append('file', blob, zipName);
  body.append('fileId', fileId);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Appwrite-Project': projectId,
      'X-Appwrite-Key': apiKey,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Appwrite upload failed ${res.status}: ${text}`);
  }
  console.log(`Uploaded ${zipName} to bucket "${BUCKET_ID}" (fileId: ${fileId})`);
  return fileId;
}

/**
 * After upload, call `functions/bridge` with `latest_version` and `file_id`
 * so the singleton `platform_db.bridge` row is updated (see docs/FUNCTIONS.md — bridge).
 */
async function syncBridgeTableViaFunction(fileId, releasedVersion, env) {
  const endpoint = (env.APPWRITE_ENDPOINT || env.APPWRITE_FUNCTION_ENDPOINT || '').replace(/\/$/, '');
  const projectId = env.APPWRITE_PROJECT_ID || env.APPWRITE_FUNCTION_PROJECT_ID;
  const apiKey = env.APPWRITE_API_KEY || env.APPWRITE_FUNCTION_API_KEY;
  const functionId = (env.APPWRITE_FUNCTION_BRIDGE || 'bridge').trim();
  if (!endpoint || !projectId || !apiKey) {
    throw new Error('Missing APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, and APPWRITE_API_KEY for bridge function call');
  }

  const bodyPayload = JSON.stringify({
    action: 'latest_version',
    file_id: fileId,
    version: releasedVersion,
  });
  const url = `${endpoint}/functions/${encodeURIComponent(functionId)}/executions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Appwrite-Project': projectId,
      'X-Appwrite-Key': apiKey,
      'X-Appwrite-Response-Format': '1.8.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: bodyPayload, async: false }),
  });
  const raw = await res.text();
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`Bridge function: invalid JSON response: ${raw.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg = (parsed && (parsed.message || parsed.error)) || raw || res.status;
    throw new Error(`Bridge function HTTP ${res.status}: ${msg}`);
  }

  const st = (parsed?.status || '').toLowerCase();
  if (st === 'failed' || st === 'canceled' || st === 'cancelled') {
    throw new Error(`Bridge function execution ${parsed.status}: ${parsed.errors || raw}`);
  }

  const code = parsed.responseStatusCode;
  if (code != null && code !== 200) {
    throw new Error(`Bridge function execution HTTP ${code}: ${parsed.responseBody || raw}`);
  }

  let inner;
  try {
    const rb = parsed.responseBody;
    if (typeof rb === 'string' && rb.trim()) {
      inner = JSON.parse(rb);
    } else if (rb && typeof rb === 'object') {
      inner = rb;
    }
  } catch (e) {
    throw new Error(`Bridge function: could not parse responseBody: ${e.message}`);
  }
  if (inner == null) {
    throw new Error('Bridge function: empty or missing responseBody');
  }
  if (inner.success === false) {
    throw new Error(`Bridge function: ${inner.message || 'unspecified error'}`);
  }
  console.log('Updated platform_db/bridge: previous `current` archived, new release set as `current` (bridge latest_version).');
}

async function main() {
  const env = loadEnv();
  const BRIDGE_DIR = getBridgeDir(env);
  runBridgeTests(BRIDGE_DIR, env);
  const version = readBridgeVersion(BRIDGE_DIR);
  await assertVersionNotReleased(version, env);
  const { zipPath, zipName, tmpRoot } = createZip(version, BRIDGE_DIR);
  try {
    const fileId = await uploadToAppwrite(zipPath, zipName, env);
    await syncBridgeTableViaFunction(fileId, version, env);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
  console.log('Bridge release done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
