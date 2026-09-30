import { describe, expect, it } from 'vitest';
import { currentAnnouncements, defaultShowUntil, shouldShowCard, todayInChurch, type Announcement } from './announcements';

const a = (id: string, showUntil: string, eventDate: string | null = null): Announcement => ({
  id, title: id, bodyHtml: '', eventDate, showUntil, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
});

describe('todayInChurch', () => {
  it('以 America/Los_Angeles 計算今天', () => {
    // 2026-10-01 05:00 UTC = 9/30 22:00 PDT
    expect(todayInChurch(new Date('2026-10-01T05:00:00Z'))).toBe('2026-09-30');
  });
});

describe('currentAnnouncements', () => {
  it('過濾掉顯示到早於今天的，當天仍顯示', () => {
    const list = currentAnnouncements([a('old', '2026-09-29'), a('today', '2026-09-30')], '2026-09-30');
    expect(list.map(x => x.id)).toEqual(['today']);
  });
  it('依活動日期（沒有則顯示到）由近到遠', () => {
    const list = currentAnnouncements([a('b', '2026-10-20', '2026-10-12'), a('c', '2026-10-05'), a('d', '2026-11-01', '2026-10-01')], '2026-09-30');
    expect(list.map(x => x.id)).toEqual(['d', 'c', 'b']);
  });
});

describe('defaultShowUntil', () => {
  it('有活動日期就用活動日期，否則今天起 14 天', () => {
    expect(defaultShowUntil('2026-10-12', '2026-09-30')).toBe('2026-10-12');
    expect(defaultShowUntil(null, '2026-09-30')).toBe('2026-10-14');
  });
});

describe('shouldShowCard', () => {
  it('沒關過就顯示；關過的同一批不顯示；有新公告再顯示；只少了不會再顯示', () => {
    expect(shouldShowCard(['x'], null)).toBe(true);
    expect(shouldShowCard(['x', 'y'], ['x', 'y'])).toBe(false);
    expect(shouldShowCard(['x', 'y', 'z'], ['x', 'y'])).toBe(true);
    expect(shouldShowCard(['x'], ['x', 'y'])).toBe(false);
    expect(shouldShowCard([], null)).toBe(false);
  });
});
