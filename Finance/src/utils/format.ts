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

// 簡寫日期，例如 5/21（手機端用）
export function tinyDate(value: string): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return `${parsed.getMonth() + 1}/${parsed.getDate()}`;
}

export function dateTime(value: string): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('zh-Hant-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
}
