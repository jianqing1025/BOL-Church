/** Two rows of two: what the desktop window shows without scrolling. */
export const DESKTOP_ROOMS_PER_PAGE = 4;

export interface RoomPage<T> {
  rooms: T[];
  /** Somebody is in one of this page's rooms — worth flagging from the other page. */
  live: boolean;
}

/** Splits the rooms into pages, in order. Always at least one page. */
export function roomPages<T extends { activeCount?: number }>(rooms: readonly T[], perPage: number): RoomPage<T>[] {
  const pages: RoomPage<T>[] = [];
  for (let i = 0; i < rooms.length; i += perPage) {
    const slice = rooms.slice(i, i + perPage);
    pages.push({ rooms: slice, live: slice.some((r) => (r.activeCount ?? 0) > 0) });
  }
  return pages.length > 0 ? pages : [{ rooms: [], live: false }];
}
