type VersionEntry = {
  source: string;
  location?: string;
  storageBucket?: string;
  isDefault?: boolean;
};

type VersionsMap = Record<string, VersionEntry>;

function pickDefaultVersionKey(versions: VersionsMap): string | null {
  const keys = Object.keys(versions);
  if (!keys.length) return null;
  const def = keys.find((k) => versions[k].isDefault);
  return def || keys[0];
}

function parseVersionsJson(raw: string | null | undefined): VersionsMap | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const out: VersionsMap = {};
    for (const [k, v] of Object.entries(o)) {
      if (!k || !v || typeof v !== 'object' || Array.isArray(v)) continue;
      const row = v as Record<string, unknown>;
      const src = row.source;
      if (src !== 'official' && src !== 'local' && src !== 'remote') continue;
      out[k] = {
        source: src,
        ...(row.location != null && String(row.location).trim()
          ? { location: String(row.location).trim() }
          : {}),
        ...(row.storageBucket != null && String(row.storageBucket).trim()
          ? { storageBucket: String(row.storageBucket).trim() }
          : {}),
        ...(row.is_default === true || row.isDefault === true ? { isDefault: true } : {}),
      };
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function getOrBuildVersionsMap(doc: Record<string, unknown>): VersionsMap {
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

export function setDefaultVersionInMap(versions: VersionsMap, defaultVersionKey: string): VersionsMap {
  const next: VersionsMap = {};
  for (const [k, v] of Object.entries(versions)) {
    next[k] = { ...v, isDefault: k === defaultVersionKey };
  }
  return next;
}

export function ensureSingleDefaultInVersionMap(versions: VersionsMap): VersionsMap {
  const keys = Object.keys(versions);
  if (keys.length === 0) return versions;
  const withDefault = keys.filter((k) => versions[k].isDefault);
  if (withDefault.length === 1) return versions;
  const key =
    (withDefault.length > 0 ? withDefault[0] : null) || pickDefaultVersionKey(versions) || keys[0];
  if (!key) return versions;
  return setDefaultVersionInMap(versions, key);
}

export function mirrorLegacyFieldsFromVersions(versions: VersionsMap): {
  version: string;
  source: string;
  is_default: boolean;
} {
  const key = pickDefaultVersionKey(versions);
  if (!key) return { version: '', source: 'official', is_default: false };
  const e = versions[key];
  return { version: key, source: e.source, is_default: !!e.isDefault };
}

export function serializeVersionsJson(versions: VersionsMap): string {
  return JSON.stringify(versions);
}
