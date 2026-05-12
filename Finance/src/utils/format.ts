export function currency(value: number): string {
  return new Intl.NumberFormat('zh-Hant-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value || 0);
}

export function shortDate(value: string): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-Hant-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(new Date(`${value}T00:00:00`));
}

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
