import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from './cursor';

describe('cursor', () => {
  it('往返後值不變', () => {
    const cursor = { date: '2026-09-20', id: 'abc123' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('id 含底線也能正確還原（只切第一個底線）', () => {
    const cursor = { date: '2026-09-20', id: 'a_b_c' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('壞格式回傳 null 而不是丟例外', () => {
    expect(decodeCursor('')).toBeNull();
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('沒有底線')).toBeNull();
    expect(decodeCursor('_只有id')).toBeNull();
    expect(decodeCursor('只有date_')).toBeNull();
  });
});
