export function normalizeSiteUrl(raw: unknown): string {
  if (!raw || typeof raw !== 'string') return '';
  const t = raw.trim().replace(/\/$/, '');
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
