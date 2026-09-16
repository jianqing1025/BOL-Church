import { describe, it, expect } from 'vitest';
import { galleryGrid, galleryPageSize } from './galleryLayout';

// A phone held upright, and a laptop stage.
const PHONE = 390 / 700;
const LAPTOP = 1280 / 720;

describe('galleryGrid on an upright phone', () => {
  it('stacks two or three people as full-width strips', () => {
    expect(galleryGrid(2, PHONE)).toEqual({ cols: 1, rows: 2 });
    expect(galleryGrid(3, PHONE)).toEqual({ cols: 1, rows: 3 });
  });

  it('puts four people in a square', () => {
    expect(galleryGrid(4, PHONE)).toEqual({ cols: 2, rows: 2 });
  });

  it('puts five or six into two columns of three rows', () => {
    expect(galleryGrid(5, PHONE)).toEqual({ cols: 2, rows: 3 });
    expect(galleryGrid(6, PHONE)).toEqual({ cols: 2, rows: 3 });
  });

  it('never uses more than two columns, however many people', () => {
    for (const n of [7, 8, 9, 12, 25]) {
      expect(galleryGrid(n, PHONE).cols, `${n} people`).toBeLessThanOrEqual(2);
    }
  });
});

describe('galleryGrid on a wide screen', () => {
  it('spreads small groups across a single row', () => {
    expect(galleryGrid(2, LAPTOP)).toEqual({ cols: 2, rows: 1 });
    expect(galleryGrid(3, LAPTOP)).toEqual({ cols: 3, rows: 1 });
  });

  it('squares off four and nine', () => {
    expect(galleryGrid(4, LAPTOP)).toEqual({ cols: 2, rows: 2 });
    expect(galleryGrid(9, LAPTOP)).toEqual({ cols: 3, rows: 3 });
  });

  it('grows to four columns for larger meetings', () => {
    expect(galleryGrid(12, LAPTOP)).toEqual({ cols: 4, rows: 3 });
    expect(galleryGrid(16, LAPTOP)).toEqual({ cols: 4, rows: 4 });
  });
});

describe('galleryGrid edges', () => {
  it('always yields enough cells for everyone', () => {
    for (const aspect of [PHONE, LAPTOP]) {
      for (let n = 1; n <= 30; n += 1) {
        const { cols, rows } = galleryGrid(n, aspect);
        expect(cols * rows, `${n} people at aspect ${aspect}`).toBeGreaterThanOrEqual(n);
      }
    }
  });

  it('treats a squeezed desktop stage as portrait', () => {
    // Desktop stage with the Bible drawer open can end up taller than it is wide.
    expect(galleryGrid(3, 600 / 800)).toEqual({ cols: 1, rows: 3 });
  });

  it('survives a zero or nonsense count', () => {
    expect(galleryGrid(0, PHONE)).toEqual({ cols: 1, rows: 1 });
    expect(galleryGrid(-4, LAPTOP)).toEqual({ cols: 1, rows: 1 });
  });
});

describe('galleryPageSize', () => {
  it('keeps phone pages small enough for faces to stay readable', () => {
    expect(galleryPageSize(390, PHONE)).toBe(6);
  });

  it('fits more on bigger screens', () => {
    expect(galleryPageSize(800, 800 / 600)).toBe(9);
    expect(galleryPageSize(1280, LAPTOP)).toBe(16);
  });

  it('never pages fewer than the largest single-screen layout needs', () => {
    for (const [width, aspect] of [[390, PHONE], [800, 800 / 600], [1280, LAPTOP]] as const) {
      const size = galleryPageSize(width, aspect);
      const { cols, rows } = galleryGrid(size, aspect);
      expect(cols * rows, `${width}px`).toBeGreaterThanOrEqual(size);
    }
  });
});
