import { encodeCursor, type Cursor } from './cursor';

export type SermonKind = 'sermon' | 'daily-manna';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export function normalizeLimit(raw: string | null | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return DEFAULT_PAGE_SIZE;
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

/**
 * 公開每日天言頁的一頁：從該頁第一筆的游標往下取 limit 筆可見的。
 * 寫成 `date <= ? AND (date < ? OR id <= ?)` 而不是 `(date < ? OR (date = ? AND id <= ?))`：
 * 前者的 `date <= ?` 是 idx_daily_manna_date_id 的區間條件，SQLite 直接從游標處開始掃；
 * 後者整個是 OR，查詢計畫會從最新一筆掃起，翻到第 30 頁就讀了 1,500 列。
 * 有選年份時再加下界，不讓最後一頁跨進前一年。
 */
export function buildMannaPageQuery(
  start: Cursor,
  year: string | null,
  limit: number,
): { sql: string; binds: unknown[] } {
  const conditions = ['hidden = 0', 'date <= ?', '(date < ? OR id <= ?)'];
  const binds: unknown[] = [start.date, start.date, start.id];
  if (year) {
    // 任何以 'YYYY-' 開頭的日期都 >= 'YYYY'，而前一年的一律 < 'YYYY'
    conditions.push('date >= ?');
    binds.push(year);
  }
  binds.push(limit);
  return {
    sql: `SELECT * FROM daily_manna WHERE ${conditions.join(' AND ')} ORDER BY date DESC, id DESC LIMIT ?`,
    binds,
  };
}
