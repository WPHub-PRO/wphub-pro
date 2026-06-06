/**
 * Replace `{{key}}` placeholders; unknown keys resolve to empty string.
 * @param {unknown} template
 * @param {Record<string, unknown>} vars
 */
export function substitutePlaceholders(template, vars) {
  const m = vars && typeof vars === 'object' ? vars : {};
  const s = template == null ? '' : String(template);
  return s.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey) => {
    const key = String(rawKey).trim();
    const v = m[key];
    if (v == null) return '';
    return String(v);
  });
}
