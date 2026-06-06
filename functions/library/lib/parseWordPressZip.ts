import AdmZip from 'adm-zip';

export function normalizeWpSlug(slug: string): string {
  return String(slug || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function parseWpHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const slice = text.length > 24576 ? text.slice(0, 24576) : text;
  const re = /^[ \t*#]*([A-Za-z0-9 \/-]+):\s*(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    const key = m[1].trim().toLowerCase();
    if (!headers[key]) headers[key] = m[2].trim();
  }
  return headers;
}

export type WpZipMeta = {
  name: string;
  version: string;
  slug: string;
  author: string;
  folder: string;
};

export function parseWordPressZip(
  buffer: Uint8Array,
  type: 'plugin' | 'theme',
  expectedSlugNormalized?: string,
): WpZipMeta {
  if (!buffer || buffer.length === 0) {
    const e = new Error('Empty ZIP file.') as Error & { code?: string };
    e.code = 'INVALID_ZIP';
    throw e;
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    const e = new Error('Could not read ZIP archive.') as Error & { code?: string };
    e.code = 'INVALID_ZIP';
    throw e;
  }

  const entries = zip.getEntries();
  const roots = new Set<string>();
  for (const ent of entries) {
    const raw = ent.entryName || '';
    if (!raw || raw.startsWith('__MACOSX/') || raw.includes('/.DS_Store')) continue;
    const name = raw.replace(/\\/g, '/');
    const parts = name.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    roots.add(parts[0]);
  }

  if (roots.size === 0) {
    const e = new Error('ZIP has no usable files.') as Error & { code?: string };
    e.code = 'INVALID_STRUCTURE';
    throw e;
  }
  if (roots.size > 1) {
    const e = new Error('ZIP must contain a single root folder (WordPress distribution layout).') as Error & {
      code?: string;
    };
    e.code = 'INVALID_STRUCTURE';
    throw e;
  }

  const folder = [...roots][0];
  const folderPrefix = `${folder}/`;

  if (type === 'theme') {
    const stylePath = `${folderPrefix}style.css`;
    const styleEnt = zip.getEntry(stylePath);
    if (!styleEnt) {
      const e = new Error('Theme ZIP must include style.css in the root folder.') as Error & { code?: string };
      e.code = 'INVALID_THEME';
      throw e;
    }
    let cssText = '';
    try {
      cssText = styleEnt.getData().toString('utf8');
    } catch {
      const e = new Error('Could not read style.css.') as Error & { code?: string };
      e.code = 'INVALID_THEME';
      throw e;
    }
    const h = parseWpHeaders(cssText);
    const name = (h['theme name'] || '').trim();
    const version = (h.version || '').trim();
    const textDomain = (h['text domain'] || '').trim();
    const slugRaw = textDomain || folder;
    const slug = normalizeWpSlug(slugRaw);
    if (!name || !version || !slug) {
      const e = new Error(
        'Theme ZIP is missing required metadata (Theme Name, Version, and slug from Text Domain or folder name).',
      ) as Error & { code?: string };
      e.code = 'MISSING_METADATA';
      throw e;
    }
    const author = (h.author || '').replace(/<[^>]*>/g, '').trim() || 'Unknown';
    if (expectedSlugNormalized && expectedSlugNormalized !== slug) {
      const e = new Error(
        `ZIP slug "${slug}" does not match selected slug "${expectedSlugNormalized}".`,
      ) as Error & { code?: string };
      e.code = 'SLUG_MISMATCH';
      throw e;
    }
    return { name, version, slug, author, folder };
  }

  const phpAtRoot = entries.filter((ent) => {
    const raw = (ent.entryName || '').replace(/\\/g, '/');
    if (!raw.startsWith(folderPrefix) || raw.endsWith('/')) return false;
    const rest = raw.slice(folderPrefix.length);
    if (!rest.endsWith('.php') || rest.includes('/')) return false;
    return true;
  });

  let mainHeaders: Record<string, string> | null = null;
  for (const ent of phpAtRoot) {
    let chunk = '';
    try {
      chunk = ent.getData().toString('utf8');
    } catch {
      continue;
    }
    const headSlice = chunk.length > 24576 ? chunk.slice(0, 24576) : chunk;
    if (!/plugin\s*name\s*:/i.test(headSlice)) continue;
    mainHeaders = parseWpHeaders(headSlice);
    if ((mainHeaders['plugin name'] || '').trim()) break;
    mainHeaders = null;
  }

  if (!mainHeaders) {
    const e = new Error('Could not find a main plugin PHP file with a Plugin Name header.') as Error & {
      code?: string;
    };
    e.code = 'INVALID_PLUGIN';
    throw e;
  }

  const name = (mainHeaders['plugin name'] || '').trim();
  const version = (mainHeaders.version || '').trim();
  const textDomain = (mainHeaders['text domain'] || '').trim();
  const slugRaw = textDomain || folder;
  const slug = normalizeWpSlug(slugRaw);
  if (!name || !version || !slug) {
    const e = new Error(
      'Plugin ZIP is missing required metadata (Plugin Name, Version, and slug from Text Domain or folder name).',
    ) as Error & { code?: string };
    e.code = 'MISSING_METADATA';
    throw e;
  }
  const author = (mainHeaders.author || '').replace(/<[^>]*>/g, '').trim() || 'Unknown';

  if (expectedSlugNormalized && expectedSlugNormalized !== slug) {
    const e = new Error(
      `ZIP slug "${slug}" does not match selected slug "${expectedSlugNormalized}".`,
    ) as Error & { code?: string };
    e.code = 'SLUG_MISMATCH';
    throw e;
  }

  return { name, version, slug, author, folder };
}
