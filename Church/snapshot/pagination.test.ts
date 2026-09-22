import { describe, it, expect } from 'vitest';
import { buildKeysetQuery, slicePage, normalizeLimit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './pagination';
import { decodeCursor } from './cursor';

describe('normalizeLimit', () => {
  it('沒給或給爛值時用預設', () => {
    expect(normalizeLimit(null)).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizeLimit('abc')).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizeLimit('0')).toBe(DEFAULT_PAGE_SIZE);
    expect(normalizeLimit('-5')).toBe(DEFAULT_PAGE_SIZE);
  });
  it('夾在上限內，避免有人要一次拿 10000 筆', () => {
    expect(normalizeLimit('10')).toBe(10);
    expect(normalizeLimit('9999')).toBe(MAX_PAGE_SIZE);
  });
});

describe('buildKeysetQuery', () => {
  it('sermon 查 sermons 並帶 type 條件', () => {
    const q = buildKeysetQuery('sermon', null, 20);
    expect(q.sql).toContain('FROM sermons');
    expect(q.sql).toContain('type = ?');
    expect(q.binds).toEqual(['sermon', 21]); // limit + 1，多拿一筆判斷還有沒有下一頁
  });

  it('daily-manna 查 daily_manna 且沒有 type 條件', () => {
    const q = buildKeysetQuery('daily-manna', null, 20);
    expect(q.sql).toContain('FROM daily_manna');
    expect(q.sql).not.toContain('type = ?');
    expect(q.binds).toEqual([21]);
  });

  it('有游標時用 (date, id) 複合比較，不是只比 date', () => {
    const q = buildKeysetQuery('sermon', { date: '2026-09-20', id: 'x1' }, 20);
    expect(q.sql).toContain('date < ? OR (date = ? AND id < ?)');
    expect(q.binds).toEqual(['sermon', '2026-09-20', '2026-09-20', 'x1', 21]);
  });

  it('永遠以 date DESC, id DESC 排序，否則游標語意不成立', () => {
    expect(buildKeysetQuery('sermon', null, 20).sql).toContain('ORDER BY date DESC, id DESC');
  });
});

describe('slicePage', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ date: '2026-09-20', id: `id${i}` }));

  it('拿到的筆數沒超過 limit 時代表是最後一頁', () => {
    const page = slicePage(rows(3), 20);
    expect(page.items).toHaveLength(3);
    expect(page.nextCursor).toBeNull();
  });

  it('多拿到的那一筆要丟掉，並用最後一筆產生游標', () => {
    const page = slicePage(rows(21), 20);
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).toBe('2026-09-20_id19');
  });
});

describe('翻頁完整性（同一天多筆是最容易出錯的情況）', () => {
  // 全部同一天，只靠 date 當游標一定會漏資料或無限迴圈。
  const all = Array.from({ length: 25 }, (_, i) => ({
    date: '2026-09-20',
    id: `id${String(24 - i).padStart(2, '0')}`, // 已依 date DESC, id DESC 排好
  }));

  // 模擬 SQL 的 WHERE 語意，驗證游標協定本身是對的
  const query = (cursorRaw: string | null, limit: number) => {
    const cursor = decodeCursor(cursorRaw);
    const filtered = cursor
      ? all.filter(r => r.date < cursor.date || (r.date === cursor.date && r.id < cursor.id))
      : all;
    return slicePage(filtered.slice(0, limit + 1), limit);
  };

  it('翻完所有頁，不重複也不遺漏', () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const page: ReturnType<typeof query> = query(cursor, 10);
      seen.push(...page.items.map(r => r.id));
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(seen).toEqual(all.map(r => r.id));
  });
});
