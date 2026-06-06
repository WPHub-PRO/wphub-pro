/** @param {string} path */
function normalizePath(path) {
  if (!path || typeof path !== 'string') return '';
  const s = path.trim();
  if (!s) return '';
  return s.startsWith('/') ? s : `/${s}`;
}

/** Split `path` (may include `?query`) into pathname + URLSearchParams. */
function splitPathAndQuery(fullPath) {
  const raw = normalizePath(fullPath);
  const q = raw.indexOf('?');
  if (q === -1) return { pathname: raw, searchParams: new URLSearchParams() };
  return {
    pathname: raw.slice(0, q) || '/',
    searchParams: new URLSearchParams(raw.slice(q + 1)),
  };
}

export { normalizePath, splitPathAndQuery };