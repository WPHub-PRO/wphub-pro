import type {
  BulkResponseShape,
  PluginBulkNormResult,
  PluginBulkRow,
  PluginInstallBulkNormResult,
  PluginInstallBulkRow,
  ThemeBulkNormResult,
  ThemeBulkRow,
  ThemeInstallBulkNormResult,
  ThemeInstallBulkRow,
} from './types.ts';

export function httpsZipUrl(raw: unknown): string {
  const z = String(raw || '').trim();
  return z.startsWith('https://') ? z : '';
}

export function parseCompositeLibraryItemId(libraryItemId: string, version: string): { libraryItemId: string; version: string } {
  const COMPOSITE_SEP = '::';
  const compIdx = libraryItemId.indexOf(COMPOSITE_SEP);
  if (compIdx <= 0) return { libraryItemId, version };
  try {
    const idPart = libraryItemId.slice(0, compIdx).trim();
    const encPart = libraryItemId.slice(compIdx + COMPOSITE_SEP.length);
    return {
      libraryItemId: idPart,
      version: version || decodeURIComponent(encPart).trim(),
    };
  } catch {
    return { libraryItemId, version };
  }
}

function installRowHasPayload(row: PluginInstallBulkRow): boolean {
  const zip = httpsZipUrl(row.zip_url) || httpsZipUrl(row.zipUrl);
  const slug = String(row.slug || '').trim();
  const version = String(row.version ?? '').trim();
  const libId = String(row.libraryItemId || row.library_item_id || '').trim();
  return Boolean(zip || (slug && version) || (libId && version));
}

export function normalizePluginInstallBulkBody(body: Record<string, unknown>): PluginInstallBulkNormResult {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  if (Array.isArray(b.plugins) && b.plugins.length > 0) {
    const plugins: PluginInstallBulkRow[] = [];
    for (const entry of b.plugins) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const row = entry as Record<string, unknown>;
        const out: PluginInstallBulkRow = {};
        const slug = String(row.slug || row.wpSlug || row.wp_slug || row.routeSlug || row.route_slug || '').trim();
        const version = String(row.version ?? '').trim();
        const plugin = String(row.plugin || '').trim();
        if (slug) out.slug = slug;
        if (version) out.version = version;
        if (plugin) out.plugin = plugin;
        for (const k of [
          'zip_url',
          'zipUrl',
          'source',
          'library_item_id',
          'libraryItemId',
          'routeSlug',
          'route_slug',
          'wpSlug',
          'wp_slug',
        ]) {
          if (row[k] != null && row[k] !== '') out[k] = row[k];
        }
        if (!installRowHasPayload(out)) {
          return {
            ok: false,
            message: 'Each plugins[] install entry needs zip_url, slug + version, or libraryItemId + version.',
          };
        }
        plugins.push(out);
      }
    }
    if (!plugins.length) {
      return { ok: false, message: 'body.plugins must be a non-empty array.' };
    }
    return { ok: true, body: { plugins } };
  }
  return {
    ok: false,
    message: 'body.plugins must be a non-empty array.',
  };
}

function themeInstallRowHasPayload(row: ThemeInstallBulkRow): boolean {
  const zip = httpsZipUrl(row.zip_url) || httpsZipUrl(row.zipUrl);
  const slug = String(row.slug || row.stylesheet || '').trim();
  const version = String(row.version ?? '').trim();
  const libId = String(row.libraryItemId || row.library_item_id || '').trim();
  return Boolean(zip || (slug && version) || (libId && version));
}

export function normalizeThemeInstallBulkBody(body: Record<string, unknown>): ThemeInstallBulkNormResult {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  if (Array.isArray(b.themes) && b.themes.length > 0) {
    const themes: ThemeInstallBulkRow[] = [];
    for (const entry of b.themes) {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const row = entry as Record<string, unknown>;
        const out: ThemeInstallBulkRow = {};
        const slug = String(
          row.slug || row.wpSlug || row.wp_slug || row.stylesheet || row.routeSlug || row.route_slug || '',
        )
          .trim()
          .toLowerCase();
        const version = String(row.version ?? '').trim();
        if (slug) {
          out.slug = slug;
          out.stylesheet = slug;
        }
        if (version) out.version = version;
        for (const k of [
          'zip_url',
          'zipUrl',
          'source',
          'library_item_id',
          'libraryItemId',
          'routeSlug',
          'route_slug',
          'wpSlug',
          'wp_slug',
        ]) {
          if (row[k] != null && row[k] !== '') out[k] = row[k];
        }
        if (!themeInstallRowHasPayload(out)) {
          return {
            ok: false,
            message: 'Each themes[] install entry needs zip_url, slug + version, or libraryItemId + version.',
          };
        }
        themes.push(out);
      }
    }
    if (!themes.length) {
      return { ok: false, message: 'body.themes must be a non-empty array.' };
    }
    return { ok: true, body: { themes } };
  }
  return {
    ok: false,
    message: 'body.themes must be a non-empty array.',
  };
}

export function pluginDirSlug(pluginFile: string): string {
  const t = String(pluginFile || '')
    .replace(/\\/g, '/')
    .trim();
  if (!t) return '';
  const i = t.indexOf('/');
  return i < 0 ? t.toLowerCase() : t.slice(0, i).toLowerCase();
}

export function normalizePluginBulkBody(body: Record<string, unknown>): PluginBulkNormResult {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  if (Array.isArray(b.plugins) && b.plugins.length > 0) {
    const plugins: PluginBulkRow[] = [];
    for (const entry of b.plugins) {
      if (typeof entry === 'string' && entry.trim()) {
        const plugin = entry.trim();
        plugins.push({ plugin, slug: pluginDirSlug(plugin), version: '' });
        continue;
      }
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const row = entry as Record<string, unknown>;
        const plugin = String(row.plugin || '').trim();
        if (!plugin) {
          return { ok: false, message: 'Each plugins[] object must include plugin (file path).' };
        }
        let slug = String(row.slug || '').trim();
        if (!slug) slug = pluginDirSlug(plugin);
        const version = String(row.version ?? '').trim();
        const out: PluginBulkRow = { plugin, slug, version };
        for (const k of ['zip_url', 'zipUrl', 'source', 'library_item_id', 'libraryItemId']) {
          if (row[k] != null && row[k] !== '') out[k] = row[k];
        }
        plugins.push(out);
      }
    }
    if (!plugins.length) {
      return { ok: false, message: 'body.plugins must be a non-empty array.' };
    }
    return { ok: true, body: { plugins } };
  }
  const plugin = String(b.plugin || '').trim();
  if (plugin) {
    const slug = String(b.slug || '').trim() || pluginDirSlug(plugin);
    const version = String(b.version ?? '').trim();
    const one: PluginBulkRow = { plugin, slug, version };
    for (const k of ['zip_url', 'zipUrl', 'source', 'library_item_id', 'libraryItemId']) {
      if (b[k] != null && b[k] !== '') one[k] = b[k];
    }
    return { ok: true, body: { plugins: [one] } };
  }
  return { ok: false, message: 'body.plugins (array of objects) or body.plugin is required.' };
}

export function normalizeThemeBulkBody(body: Record<string, unknown>): ThemeBulkNormResult {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  if (Array.isArray(b.themes) && b.themes.length > 0) {
    const themes: ThemeBulkRow[] = [];
    for (const entry of b.themes) {
      if (typeof entry === 'string' && entry.trim()) {
        const s = entry.trim();
        themes.push({ stylesheet: s, slug: s, version: '' });
        continue;
      }
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const row = entry as Record<string, unknown>;
        const stylesheet = String(row.stylesheet || row.slug || '').trim();
        if (!stylesheet) {
          return { ok: false, message: 'Each themes[] object must include stylesheet or slug.' };
        }
        const slug = String(row.slug || '').trim() || stylesheet;
        const version = String(row.version ?? '').trim();
        const out: ThemeBulkRow = { stylesheet, slug, version };
        for (const k of [
          'zip_url',
          'zipUrl',
          'source',
          'library_item_id',
          'libraryItemId',
          'routeSlug',
          'route_slug',
          'wpSlug',
          'wp_slug',
        ]) {
          if (row[k] != null && row[k] !== '') out[k] = row[k];
        }
        themes.push(out);
      }
    }
    if (!themes.length) {
      return { ok: false, message: 'body.themes must be a non-empty array.' };
    }
    return { ok: true, body: { themes } };
  }
  const slug = String(b.slug || b.stylesheet || '').trim();
  if (slug) {
    const version = String(b.version ?? '').trim();
    const one: ThemeBulkRow = { stylesheet: slug, slug, version };
    for (const k of ['zip_url', 'zipUrl', 'source', 'libraryItemId', 'library_item_id', 'routeSlug', 'route_slug']) {
      if (b[k]) one[k] = b[k];
    }
    return { ok: true, body: { themes: [one] } };
  }
  return { ok: false, message: 'body.themes (array of objects) or body.slug / body.stylesheet is required.' };
}

export function mergeBulkResponseShape(data: unknown): BulkResponseShape | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const results = d.results;
  if (!Array.isArray(results)) return null;
  return {
    results: results as BulkResponseShape['results'],
    succeeded: typeof d.succeeded === 'number' ? d.succeeded : 0,
    failed: typeof d.failed === 'number' ? d.failed : 0,
  };
}
