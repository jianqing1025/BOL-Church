import { encodeCursor, type Cursor } from './cursor';

export type SermonKind = 'sermon' | 'daily-manna';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export function normalizeLimit(raw: string | null | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(value), MAX_PAGE_SIZE);
}

// 多拿一筆，就能判斷「還有沒有下一頁」而不必再發一次 COUNT。
export function buildKeysetQuery(
  kind: SermonKind,
  cursor: Cursor | null,
  limit: number,
): { sql: string; binds: unknown[] } {
  const table = kind === 'sermon' ? 'sermons' : 'daily_manna';
  const conditions: string[] = [];
  const binds: unknown[] = [];

  if (kind === 'sermon') {
    conditions.push('type = ?');
    binds.push('sermon');
  }
  if (cursor) {
    conditions.push('(date < ? OR (date = ? AND id < ?))');
    binds.push(cursor.date, cursor.date, cursor.id);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')} ` : '';
  binds.push(limit + 1);
  return {
    sql: `SELECT * FROM ${table} ${where}ORDER BY date DESC, id DESC LIMIT ?`,
    binds,
  };
}

export function slicePage<T extends Cursor>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  return { items, nextCursor: encodeCursor(items[items.length - 1]) };
}
