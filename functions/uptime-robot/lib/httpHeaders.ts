/**
 * Case-insensitive header lookup (Node lowercases keys, e.g. UR-API-TOKEN → ur-api-token).
 * @param {Record<string, string | string[] | undefined> | undefined} headers
 * @param {string} name Canonical name e.g. UR-API-TOKEN
 * @returns {string}
 */
function getHeader(headers, name) {
  const h = headers && typeof headers === 'object' ? headers : {};
  const want = String(name).toLowerCase();
  for (const [k, v] of Object.entries(h)) {
    if (String(k).toLowerCase() === want) {
      const val = Array.isArray(v) ? v[0] : v;
      return String(val ?? '').trim();
    }
  }
  return '';
}

export { getHeader };