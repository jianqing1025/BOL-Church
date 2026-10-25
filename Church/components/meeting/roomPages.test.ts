import { describe, expect, it } from 'vitest';
import { DESKTOP_ROOMS_PER_PAGE, roomPages } from './roomPages';

const rooms = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, activeCount: 0 }));

describe('roomPages', () => {
  it('puts four rooms on the first page and the rest on the second', () => {
    const pages = roomPages(rooms, DESKTOP_ROOMS_PER_PAGE);
    expect(pages.map((p) => p.rooms.map((r) => r.id))).toEqual([['a', 'b', 'c', 'd'], ['e', 'f']]);
  });

  it('marks the pages that have a meeting going on, so it can be seen from the other page', () => {
    const live = rooms.map((r) => (r.id === 'f' ? { ...r, activeCount: 3 } : r));
    expect(roomPages(live, DESKTOP_ROOMS_PER_PAGE).map((p) => p.live)).toEqual([false, true]);
  });

  it('keeps a single page when everything fits', () => {
    expect(roomPages(rooms.slice(0, 4), DESKTOP_ROOMS_PER_PAGE)).toHaveLength(1);
    expect(roomPages([], DESKTOP_ROOMS_PER_PAGE)).toEqual([{ rooms: [], live: false }]);
  });
});
