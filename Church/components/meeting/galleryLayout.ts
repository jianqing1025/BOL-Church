export interface GalleryGrid {
  cols: number;
  rows: number;
}

/** Where a tall layout stops making sense and a wide one starts. */
const PORTRAIT_MAX_ASPECT = 1;

/**
 * Tall areas — a phone held upright, or a desktop stage squeezed by the Bible
 * drawer. Never more than two columns: a third column on a 360px-wide screen
 * leaves each person a sliver too narrow to recognise a face in.
 */
const PORTRAIT: Record<number, GalleryGrid> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 1, rows: 2 },
  3: { cols: 1, rows: 3 },
  4: { cols: 2, rows: 2 },
  5: { cols: 2, rows: 3 },
  6: { cols: 2, rows: 3 },
  7: { cols: 2, rows: 4 },
  8: { cols: 2, rows: 4 },
};

/** Wide areas — a laptop, or a phone turned sideways. */
const WIDE: Record<number, GalleryGrid> = {
  1: { cols: 1, rows: 1 },
  2: { cols: 2, rows: 1 },
  3: { cols: 3, rows: 1 },
  4: { cols: 2, rows: 2 },
  5: { cols: 3, rows: 2 },
  6: { cols: 3, rows: 2 },
  7: { cols: 4, rows: 2 },
  8: { cols: 4, rows: 2 },
  9: { cols: 3, rows: 3 },
  10: { cols: 4, rows: 3 },
  11: { cols: 4, rows: 3 },
  12: { cols: 4, rows: 3 },
};

/**
 * The tile arrangement for a head count in an area of the given shape.
 *
 * `aspect` is the stage's own width ÷ height, not the window's, so the layout
 * reacts to the chat and Bible drawers as well as to the device.
 */
export function galleryGrid(count: number, aspect: number): GalleryGrid {
  const n = Math.max(1, Math.floor(count));
  const portrait = aspect < PORTRAIT_MAX_ASPECT;
  const table = portrait ? PORTRAIT : WIDE;
  const known = table[n];
  if (known) return known;

  // Beyond the table, keep filling rows at the widest column count it uses.
  const cols = portrait ? 2 : 4;
  return { cols, rows: Math.ceil(n / cols) };
}

/**
 * How many people to show before paging.
 *
 * Fewer, larger tiles beat a wall of stamps: on a phone six is the point where
 * faces stop being readable, which is also where the two-column layout runs out
 * of comfortable rows.
 */
export function galleryPageSize(width: number, aspect: number): number {
  if (aspect < PORTRAIT_MAX_ASPECT) return 6;
  if (width < 900) return 9;
  return 16;
}
