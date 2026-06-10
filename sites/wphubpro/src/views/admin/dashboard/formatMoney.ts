export function formatMoneyFromCents(cents: number | undefined, currency = 'eur'): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
