import { WPHUB_APPWRITE_IDS, appwriteEndpoint, appwriteProjectId } from '@code045/wphubpro-shared';
function databaseId() {
  return String(process.env.APPWRITE_DATABASE_ID || WPHUB_APPWRITE_IDS.defaults.platformDatabaseId).trim();
}

function libraryCollectionId() {
  return WPHUB_APPWRITE_IDS.platformTables.library;
}

function bucketIdForLibraryType(libraryType) {
  return String(libraryType || '').toLowerCase() === 'theme'
    ? WPHUB_APPWRITE_IDS.buckets.themes
    : WPHUB_APPWRITE_IDS.buckets.plugins;
}

/**
 * Public bucket read + `project` query — WordPress bridge downloads the ZIP via plain HTTPS GET.
 * @returns {{ ok: true, zip_url: string } | { ok: false, statusCode?: number, message: string }}
 */
function buildAppwriteStorageDownloadUrl({ bucketId, fileId, log }) {
  const endpoint = String(appwriteEndpoint() || '').replace(/\/+$/, '');
  const projectId = String(appwriteProjectId() || '').trim();
  const bid = String(bucketId || '').trim();
  const fid = String(fileId || '').trim();
  if (!endpoint || !projectId || !bid || !fid) {
    return {
      ok: false,
      statusCode: 500,
      message:
        'Local library ZIP is on Appwrite Storage but APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID (or function equivalents) are not set on wp-proxy.',
    };
  }
  const zip_url = `${endpoint}/storage/buckets/${encodeURIComponent(bid)}/files/${encodeURIComponent(fid)}/download?project=${encodeURIComponent(projectId)}`;
  if (typeof zip_url === 'string' && zip_url.startsWith('https://')) {
    return { ok: true, zip_url };
  }
  return {
    ok: false,
    statusCode: 400,
    message: 'Could not build HTTPS Appwrite storage download URL.',
  };
}

/**
 * @param {string} location — Appwrite Storage file `$id`
 * @param {string} [storageBucket] — from `versions_json` entry (`plugins` / `themes`)
 * @param {string} [libraryType] — `theme` | `plugin` from library row
 */
async function resolveLocalLibraryZipUrl(location, storageBucket, libraryType, log) {
  const loc = String(location || '').trim();
  if (!loc) {
    return { ok: false, statusCode: 400, message: 'Local library version has no storage location.' };
  }
  const bucket =
    String(storageBucket || '').trim() || bucketIdForLibraryType(libraryType);
  return buildAppwriteStorageDownloadUrl({ bucketId: bucket, fileId: loc, log });
}

function slugFromPluginPath(pluginPath) {
  const p = String(pluginPath || '').trim();
  if (!p) return '';
  const i = p.indexOf('/');
  return i > 0 ? p.slice(0, i) : '';
}

function parseVersionsJson(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      if (!k || !v || typeof v !== 'object') continue;
      const src = v.source;
      if (src !== 'official' && src !== 'local' && src !== 'remote') continue;
      const loc =
        (v.location != null && String(v.location).trim()) ||
        (v.s3_path != null && String(v.s3_path).trim()) ||
        (v.s3Path != null && String(v.s3Path).trim()) ||
        (v.s3_key != null && String(v.s3_key).trim()) ||
        (v.remote_url != null && String(v.remote_url).trim()) ||
        (v.remoteUrl != null && String(v.remoteUrl).trim()) ||
        '';
      out[k] = {
        source: src,
        ...(loc ? { location: loc } : {}),
        ...(v.storageBucket != null && String(v.storageBucket).trim()
          ? { storageBucket: String(v.storageBucket).trim() }
          : {}),
        ...(v.is_default === true || v.isDefault === true ? { isDefault: true } : {}),
      };
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

const LIBRARY_COMPOSITE_SEP = '::';

/**
 * Hub `LibraryItem.$id` may be `documentId::encodeURIComponent(versionKey)`; Appwrite `getDocument` needs the real id.
 * @param {string} libraryItemId
 * @param {string} [explicitVersion]
 * @returns {{ docId: string; version: string }}
 */
function normalizeLibraryDocumentIdAndVersion(libraryItemId, explicitVersion) {
  let docId = String(libraryItemId || '').trim();
  let ver = String(explicitVersion || '').trim();
  const idx = docId.indexOf(LIBRARY_COMPOSITE_SEP);
  if (idx > 0) {
    const idPart = docId.slice(0, idx);
    const encPart = docId.slice(idx + LIBRARY_COMPOSITE_SEP.length);
    try {
      const fromComposite = decodeURIComponent(encPart);
      docId = idPart;
      if (!ver) ver = String(fromComposite || '').trim();
    } catch {
      /* keep docId */
    }
  }
  return { docId, version: ver };
}

/**
 * @param {Record<string, { source?: string; location?: string }>} map
 * @param {string} version
 */
function pickVersionMapEntry(map, version) {
  const v = String(version || '').trim();
  if (!v || !map || typeof map !== 'object') return null;
  if (map[v]) return { key: v, entry: map[v] };
  const lower = v.toLowerCase();
  for (const k of Object.keys(map)) {
    if (String(k).trim().toLowerCase() === lower) return { key: k, entry: map[k] };
  }
  return null;
}

function getOrBuildVersionsMap(doc) {
  const raw = doc.versions_json ?? doc.versionsJson;
  const p = parseVersionsJson(typeof raw === 'string' ? raw : null);
  if (p && Object.keys(p).length > 0) return { ...p };
  const v = doc.version != null ? String(doc.version) : '';
  if (!v) return {};
  const source = String(doc.source ?? 'official');
  const loc =
    String(doc.s3Path || doc.s3_path || doc.s3_key || '').trim() ||
    String(doc.remoteUrl || doc.remote_url || '').trim() ||
    undefined;
  return {
    [v]: {
      source: source === 'local' ? 'local' : source === 'remote' ? 'remote' : 'official',
      ...(loc ? { location: loc } : {}),
      isDefault: true,
    },
  };
}

async function fetchWordpressOrgPluginZip(fetchImpl, wpSlug, version) {
  const slug = String(wpSlug || '').trim();
  const ver = String(version || '').trim();
  if (!slug || !ver) {
    return { ok: false, message: 'Missing plugin slug or version for WordPress.org lookup.' };
  }
  const url = `https://api.wordpress.org/plugins/info/1.0/${encodeURIComponent(slug)}.json`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return {
      ok: false,
      message: `WordPress.org plugin info failed (${res.status}). ${String(t).slice(0, 200)}`,
    };
  }
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, message: 'Invalid JSON from WordPress.org.' };
  }
  const versions =
    data && typeof data.versions === 'object' && data.versions !== null ? data.versions : {};
  const zipUrl = versions[ver];
  if (typeof zipUrl !== 'string' || !zipUrl.startsWith('https://')) {
    return {
      ok: false,
      message: `Version "${ver}" is not available from WordPress.org for plugin "${slug}".`,
    };
  }
  return { ok: true, zip_url: zipUrl };
}

/**
 * @param {string} zipUrl
 * @param {string} [source] official | local | remote
 */
function pluginZipResolveOk(zipUrl, source) {
  const out = { ok: true, zipUrl: String(zipUrl || '').trim() };
  const s = String(source || '').trim().toLowerCase();
  if (s === 'official' || s === 'local' || s === 'remote') {
    out.source = s;
  }
  return out;
}

/**
 * Resolve `zip_url` for `plugins/manage/update` when Hub sends version/source but not zip.
 * @returns {Promise<{ ok: true, zipUrl: string, source?: string } | { ok: false, statusCode: number, message: string }>}
 */
async function resolvePluginUpdateZipUrl({ databases, fetchImpl, log, body }) {
  const normalized = body && typeof body === 'object' ? body : {};
  const zipExisting = String(normalized.zip_url || '').trim();
  if (zipExisting.startsWith('https://')) {
    return pluginZipResolveOk(zipExisting, String(normalized.source || '').trim().toLowerCase());
  }

  const libraryItemIdRaw = String(normalized.library_item_id || normalized.libraryItemId || '').trim();
  const { docId: libraryDocId, version: versionResolved } = normalizeLibraryDocumentIdAndVersion(
    libraryItemIdRaw,
    String(normalized.version || '').trim(),
  );
  const version = String(versionResolved || '').trim();
  if (!version) {
    return { ok: false, statusCode: 400, message: 'Missing version for plugin update zip resolution.' };
  }

  const sourceRaw = String(normalized.source || '').trim().toLowerCase();
  const officialLike = !sourceRaw || ['official', 'wordpress', 'wporg'].includes(sourceRaw);

  try {
    if (libraryDocId) {
      const dbId = databaseId();
      const libColl = libraryCollectionId();
      let doc;
      try {
        doc = await databases.getDocument(dbId, libColl, libraryDocId);
      } catch (e) {
        return { ok: false, statusCode: 404, message: `Library item not found: ${e.message || 'unknown error'}` };
      }

      const map = getOrBuildVersionsMap(doc);
      const picked = pickVersionMapEntry(map, version);
      if (!picked) {
        return {
          ok: false,
          statusCode: 404,
          message: `Version "${version}" not found on this library item (keys: ${Object.keys(map).slice(0, 8).join(', ') || 'none'}).`,
        };
      }
      const { entry } = picked;

      const docFallbackLoc =
        String(doc.s3Path || doc.s3_path || doc.s3_key || '').trim() ||
        String(doc.remoteUrl || doc.remote_url || '').trim() ||
        '';
      const loc =
        (entry.location && String(entry.location).trim()) ||
        (entry.source === 'local' || entry.source === 'remote' ? docFallbackLoc : '');


      switch (entry.source) {
        case 'official': {
          if (loc && loc.startsWith('https://')) {
            return pluginZipResolveOk(loc, 'official');
          }
          const wpSlug = String(doc.wpSlug || doc.wp_slug || '').trim();
          if (!fetchImpl) {
            return {
              ok: false,
              statusCode: 500,
              message: 'WordPress.org lookup requires fetch in function context.',
            };
          }
          const r = await fetchWordpressOrgPluginZip(fetchImpl, wpSlug, picked.key);
          if (!r.ok) {
            return { ok: false, statusCode: 404, message: r.message };
          }
          return pluginZipResolveOk(r.zip_url, 'official');
        }
        case 'remote': {
          if (!loc || !loc.startsWith('https://')) {
            return { ok: false, statusCode: 400, message: 'Remote library version has no valid HTTPS location.' };
          }
          return pluginZipResolveOk(loc, 'remote');
        }
        case 'local': {
          if (!loc) {
            return { ok: false, statusCode: 400, message: 'Local library version has no storage location.' };
          }
          const pr = await resolveLocalLibraryZipUrl(loc, entry.storageBucket, doc.type, log);
          if (!pr.ok) {
            return { ok: false, statusCode: pr.statusCode || 400, message: pr.message };
          }
          return pluginZipResolveOk(pr.zip_url, 'local');
        }
        default: {
          const _e = entry.source;
          void _e;
          return { ok: false, statusCode: 400, message: 'Unknown version source in library versions map.' };
        }
      }
    }

    if (officialLike) {
      const slug =
        String(normalized.wpSlug || normalized.wp_slug || normalized.slug || '').trim() ||
        slugFromPluginPath(String(normalized.plugin || '').trim());
      if (!slug) {
        return {
          ok: false,
          statusCode: 400,
          message: 'Missing plugin slug (slug / wpSlug / plugin path) for WordPress.org lookup.',
        };
      }
      if (!fetchImpl) {
        return {
          ok: false,
          statusCode: 500,
          message: 'WordPress.org lookup requires fetch in function context.',
        };
      }
      const r = await fetchWordpressOrgPluginZip(fetchImpl, slug, version);
      if (!r.ok) {
        return { ok: false, statusCode: 404, message: r.message };
      }
      return pluginZipResolveOk(r.zip_url, 'official');
    }

    if (['local', 'remote'].includes(sourceRaw)) {
      return {
        ok: false,
        statusCode: 400,
        message: 'library_item_id is required to resolve zip_url for local or remote library sources.',
      };
    }

    return { ok: false, statusCode: 400, message: `Unsupported source "${sourceRaw}" for versioned plugin update without zip_url.` };
  } catch (e) {
    if (typeof log === 'function') {
      log(`[wp-proxy] getResourceItem zip resolve: ${e.message}`);
    }
    return { ok: false, statusCode: 500, message: e.message || 'zip_url resolution failed.' };
  }
}

/**
 * Theme org fallback zip URL.
 * @param {string} slug
 * @param {string} version
 */
function themeOrgZipFallback(slug, version) {
  const s = String(slug || '').trim().toLowerCase();
  const v = String(version || '').trim();
  if (!s || !v || v === 'latest') return null;
  return `https://downloads.wordpress.org/theme/${encodeURIComponent(s)}.${encodeURIComponent(v)}.zip`;
}

/**
 * @param {string} zipUrl
 * @param {string} [source] official | local | remote
 */
function themeZipResolveOk(zipUrl, source) {
  const out = { ok: true, zipUrl: String(zipUrl || '').trim() };
  const s = String(source || '').trim().toLowerCase();
  if (s === 'official' || s === 'local' || s === 'remote') {
    out.source = s;
  }
  return out;
}

async function fetchWordpressOrgThemeZip(fetchImpl, wpSlug, version) {
  const slug = String(wpSlug || '').trim().toLowerCase();
  const ver = String(version || '').trim();
  if (!slug || !ver) {
    return { ok: false, message: 'Missing theme slug or version for WordPress.org lookup.' };
  }
  const params = new URLSearchParams();
  params.set('action', 'theme_information');
  params.set('request[slug]', slug);
  const url = `https://api.wordpress.org/themes/info/1.1/?${params.toString()}`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    return {
      ok: false,
      message: `WordPress.org theme info failed (${res.status}). ${String(t).slice(0, 200)}`,
    };
  }
  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, message: 'Invalid JSON from WordPress.org.' };
  }
  const versions =
    data && typeof data.versions === 'object' && data.versions !== null ? data.versions : {};
  const zipUrl = versions[ver];
  if (typeof zipUrl === 'string' && zipUrl.startsWith('https://')) {
    return { ok: true, zip_url: zipUrl };
  }
  const fb = themeOrgZipFallback(slug, ver);
  if (fb) {
    return { ok: true, zip_url: fb };
  }
  return {
    ok: false,
    message: `Version "${ver}" is not available from WordPress.org for theme "${slug}".`,
  };
}

/**
 * Resolve `zip_url` for theme install/update when Hub sends version/source but not zip.
 * @returns {Promise<{ ok: true, zipUrl: string, source?: string } | { ok: false, statusCode: number, message: string }>}
 */
async function resolveThemeUpdateZipUrl({ databases, fetchImpl, log, body }) {
  const normalized = body && typeof body === 'object' ? body : {};
  const zipExisting = String(normalized.zip_url || normalized.zipUrl || '').trim();
  if (zipExisting.startsWith('https://')) {
    return themeZipResolveOk(zipExisting, String(normalized.source || '').trim().toLowerCase());
  }

  const libraryItemIdRaw = String(normalized.library_item_id || normalized.libraryItemId || '').trim();
  const routeSlug = String(normalized.routeSlug || normalized.route_slug || '').trim();
  const { docId: libraryDocId, version: versionResolved } = normalizeLibraryDocumentIdAndVersion(
    libraryItemIdRaw,
    String(normalized.version || '').trim(),
  );
  const version = String(versionResolved || '').trim();
  if (!version) {
    return { ok: false, statusCode: 400, message: 'Missing version for theme update zip resolution.' };
  }

  const sourceRaw = String(normalized.source || '').trim().toLowerCase();
  const officialLike = !sourceRaw || ['official', 'wordpress', 'wporg'].includes(sourceRaw);

  try {
    if (libraryDocId) {
      const dbId = databaseId();
      const libColl = libraryCollectionId();
      let doc;
      try {
        doc = await databases.getDocument(dbId, libColl, libraryDocId);
      } catch (e) {
        return { ok: false, statusCode: 404, message: `Library item not found: ${e.message || 'unknown error'}` };
      }

      const map = getOrBuildVersionsMap(doc);
      const picked = pickVersionMapEntry(map, version);
      if (!picked) {
        return {
          ok: false,
          statusCode: 404,
          message: `Version "${version}" not found on this library item (keys: ${Object.keys(map).slice(0, 8).join(', ') || 'none'}).`,
        };
      }
      const { entry } = picked;

      const docFallbackLoc =
        String(doc.s3Path || doc.s3_path || doc.s3_key || '').trim() ||
        String(doc.remoteUrl || doc.remote_url || '').trim() ||
        '';
      const loc =
        (entry.location && String(entry.location).trim()) ||
        (entry.source === 'local' || entry.source === 'remote' ? docFallbackLoc : '');

      switch (entry.source) {
        case 'official': {
          if (loc && loc.startsWith('https://')) {
            return themeZipResolveOk(loc, 'official');
          }
          const wpSlug = String(doc.wpSlug || doc.wp_slug || routeSlug || '').trim().toLowerCase();
          if (!wpSlug) {
            return { ok: false, statusCode: 400, message: 'Missing theme slug for this library item.' };
          }
          if (!fetchImpl) {
            return {
              ok: false,
              statusCode: 500,
              message: 'WordPress.org lookup requires fetch in function context.',
            };
          }
          const r = await fetchWordpressOrgThemeZip(fetchImpl, wpSlug, picked.key);
          if (!r.ok) {
            return { ok: false, statusCode: 404, message: r.message };
          }
          return themeZipResolveOk(r.zip_url, 'official');
        }
        case 'remote': {
          if (!loc || !loc.startsWith('https://')) {
            return { ok: false, statusCode: 400, message: 'Remote library version has no valid HTTPS location.' };
          }
          return themeZipResolveOk(loc, 'remote');
        }
        case 'local': {
          if (!loc) {
            return { ok: false, statusCode: 400, message: 'Local library version has no storage location.' };
          }
          const pr = await resolveLocalLibraryZipUrl(loc, entry.storageBucket, doc.type, log);
          if (!pr.ok) {
            return { ok: false, statusCode: pr.statusCode || 400, message: pr.message };
          }
          return themeZipResolveOk(pr.zip_url, 'local');
        }
        default: {
          const _e = entry.source;
          void _e;
          return { ok: false, statusCode: 400, message: 'Unknown version source in library versions map.' };
        }
      }
    }

    if (officialLike) {
      const slug = String(
        normalized.wpSlug || normalized.wp_slug || normalized.slug || normalized.stylesheet || '',
      )
        .trim()
        .toLowerCase();
      if (!slug) {
        return {
          ok: false,
          statusCode: 400,
          message: 'Missing theme slug (slug / wpSlug / stylesheet) for WordPress.org lookup.',
        };
      }
      if (!fetchImpl) {
        return {
          ok: false,
          statusCode: 500,
          message: 'WordPress.org lookup requires fetch in function context.',
        };
      }
      const r = await fetchWordpressOrgThemeZip(fetchImpl, slug, version);
      if (!r.ok) {
        return { ok: false, statusCode: 404, message: r.message };
      }
      return themeZipResolveOk(r.zip_url, 'official');
    }

    if (['local', 'remote'].includes(sourceRaw)) {
      return {
        ok: false,
        statusCode: 400,
        message: 'library_item_id is required to resolve zip_url for local or remote library sources.',
      };
    }

    return {
      ok: false,
      statusCode: 400,
      message: `Unsupported source "${sourceRaw}" for versioned theme update without zip_url.`,
    };
  } catch (e) {
    if (typeof log === 'function') {
      log(`[wp-proxy] getResourceItem theme zip resolve: ${e.message}`);
    }
    return { ok: false, statusCode: 500, message: e.message || 'zip_url resolution failed.' };
  }
}

/**
 * Resolve theme HTTPS zip for library install (official / remote / local).
 * Thin wrapper around {@link resolveThemeUpdateZipUrl}.
 * @returns {Promise<{ ok: true, zipUrl: string, source?: string } | { ok: false, statusCode: number, message: string }>}
 */
async function resolveThemeLibraryZip({ databases, log, libraryItemId, routeSlug, version: explicitVersion, fetchImpl }) {
  return resolveThemeUpdateZipUrl({
    databases,
    fetchImpl,
    log,
    body: {
      libraryItemId,
      library_item_id: libraryItemId,
      version: explicitVersion,
      routeSlug,
      route_slug: routeSlug,
    },
  });
}

/**
 * Resolve plugin `install-version` slug/version from library official row.
 * @returns {Promise<{ ok: true, slug: string, version: string } | { ok: false, statusCode: number, message: string }>}
 */
async function resolvePluginLibraryInstallVersion({ databases, libraryItemId, routeSlug, log }) {
  const { docId } = normalizeLibraryDocumentIdAndVersion(String(libraryItemId || ''), '');
  const dbId = databaseId();
  const libColl = libraryCollectionId();
  let doc;
  try {
    doc = await databases.getDocument(dbId, libColl, docId);
  } catch (e) {
    return { ok: false, statusCode: 404, message: `Library item not found: ${e.message || 'unknown'}` };
  }
  if (String(doc.type ?? '').toLowerCase() !== 'plugin') {
    return { ok: false, statusCode: 400, message: 'Library item is not a plugin.' };
  }
  if (String(doc.source ?? '') !== 'official') {
    return {
      ok: false,
      statusCode: 400,
      message: 'Library plugin install supports official source only from the server resolver.',
    };
  }
  const slug = String(doc.wpSlug ?? doc.wp_slug ?? routeSlug ?? '')
    .trim()
    .toLowerCase();
  const v =
    doc.version === 'latest' || String(doc.version || '').trim() === 'latest'
      ? ''
      : String(doc.version ?? '').trim();
  if (!slug || !v || v === 'latest') {
    return {
      ok: false,
      statusCode: 400,
      message: 'Library plugin needs wpSlug and a pinned version (not latest) for install-version.',
    };
  }
  return { ok: true, slug, version: v };
}

/**
 * Resolve theme `install-version` slug/version from library official row.
 * @returns {Promise<{ ok: true, slug: string, version: string } | { ok: false, statusCode: number, message: string }>}
 */
async function resolveThemeLibraryInstallVersion({ databases, libraryItemId, routeSlug, log }) {
  const { docId } = normalizeLibraryDocumentIdAndVersion(String(libraryItemId || ''), '');
  const dbId = databaseId();
  const libColl = libraryCollectionId();
  let doc;
  try {
    doc = await databases.getDocument(dbId, libColl, docId);
  } catch (e) {
    return { ok: false, statusCode: 404, message: `Library item not found: ${e.message || 'unknown'}` };
  }
  if (String(doc.type ?? '').toLowerCase() !== 'theme') {
    return { ok: false, statusCode: 400, message: 'Library item is not a theme.' };
  }
  if (String(doc.source ?? '') !== 'official') {
    return {
      ok: false,
      statusCode: 400,
      message: 'Library theme install supports official source only from the server resolver.',
    };
  }
  const slug = String(doc.wpSlug ?? doc.wp_slug ?? routeSlug ?? '')
    .trim()
    .toLowerCase();
  const v =
    doc.version === 'latest' || String(doc.version || '').trim() === 'latest'
      ? ''
      : String(doc.version ?? '').trim();
  if (!slug || !v || v === 'latest') {
    return {
      ok: false,
      statusCode: 400,
      message: 'Library theme needs wpSlug and a pinned version (not latest) for install-version.',
    };
  }
  return { ok: true, slug, version: v };
}

export {
  resolvePluginUpdateZipUrl,
  resolveThemeUpdateZipUrl,
  resolveThemeLibraryZip,
  resolvePluginLibraryInstallVersion,
  resolveThemeLibraryInstallVersion,
  fetchWordpressOrgPluginZip,
  fetchWordpressOrgThemeZip,
  slugFromPluginPath,
  getOrBuildVersionsMap,
};
