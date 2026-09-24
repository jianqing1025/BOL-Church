import { describe, it, expect } from 'vitest';
import { evaluateRateLimit, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from './rateLimit';

const T0 = new Date('2026-09-23T10:00:00.000Z').getTime();

describe('evaluateRateLimit', () => {
  it('沒有既有記錄時放行，並開新視窗', () => {
    const result = evaluateRateLimit(null, T0);
    expect(result).toEqual({ allowed: true, nextWindowStartMs: T0, nextCount: 1 });
  });

  it('視窗內未達上限時放行並累加', () => {
    const result = evaluateRateLimit({ windowStartMs: T0, count: 2 }, T0 + 1000);
    expect(result).toEqual({ allowed: true, nextWindowStartMs: T0, nextCount: 3 });
  });

  it('視窗內達到上限時擋下', () => {
    const result = evaluateRateLimit({ windowStartMs: T0, count: RATE_LIMIT_MAX }, T0 + 1000);
    expect(result.allowed).toBe(false);
  });

  it('擋下時不累加計數（避免持續打擊讓視窗永不重置）', () => {
    const result = evaluateRateLimit({ windowStartMs: T0, count: RATE_LIMIT_MAX }, T0 + 1000);
    expect(result.nextCount).toBe(RATE_LIMIT_MAX);
    expect(result.nextWindowStartMs).toBe(T0);
  });

  it('視窗過期後重置', () => {
    const result = evaluateRateLimit(
      { windowStartMs: T0, count: RATE_LIMIT_MAX },
      T0 + RATE_LIMIT_WINDOW_MS + 1,
    );
    expect(result).toEqual({ allowed: true, nextWindowStartMs: T0 + RATE_LIMIT_WINDOW_MS + 1, nextCount: 1 });
  });

  it('恰好在視窗邊界上仍屬同一視窗', () => {
    const result = evaluateRateLimit({ windowStartMs: T0, count: RATE_LIMIT_MAX }, T0 + RATE_LIMIT_WINDOW_MS);
    expect(result.allowed).toBe(false);
  });

  it('上限為每分鐘 5 次', () => {
    expect(RATE_LIMIT_MAX).toBe(5);
    expect(RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });

  it('時鐘倒退時，已達上限的記錄也會重置（避免無限期封鎖）', () => {
    const result = evaluateRateLimit({ windowStartMs: T0 + 10000, count: RATE_LIMIT_MAX }, T0);
    expect(result).toEqual({ allowed: true, nextWindowStartMs: T0, nextCount: 1 });
  });

  it('時鐘倒退時，未達上限的記錄也會重置', () => {
    const result = evaluateRateLimit({ windowStartMs: T0 + 10000, count: 2 }, T0);
    expect(result).toEqual({ allowed: true, nextWindowStartMs: T0, nextCount: 1 });
  });

  it('遠未來的 windowStartMs 也會重置（只判斷正負號，不判斷大小）', () => {
    const futureMs = T0 + 365 * 24 * 60 * 60 * 1000; // 一年後
    const result = evaluateRateLimit({ windowStartMs: futureMs, count: RATE_LIMIT_MAX }, T0);
    expect(result).toEqual({ allowed: true, nextWindowStartMs: T0, nextCount: 1 });
  });

  it('前向時間邊界不變：+59999 擋、+60000 擋、+60001 放', () => {
    // +59999 應該還在視窗內，達到上限要擋下
    const result59999 = evaluateRateLimit({ windowStartMs: T0, count: RATE_LIMIT_MAX }, T0 + 59999);
    expect(result59999.allowed).toBe(false);

    // +60000 恰好在邊界，還在視窗內，達到上限要擋下
    const result60000 = evaluateRateLimit({ windowStartMs: T0, count: RATE_LIMIT_MAX }, T0 + 60000);
    expect(result60000.allowed).toBe(false);

    // +60001 超過視窗，重置並放行
    const result60001 = evaluateRateLimit({ windowStartMs: T0, count: RATE_LIMIT_MAX }, T0 + 60001);
    expect(result60001).toEqual({ allowed: true, nextWindowStartMs: T0 + 60001, nextCount: 1 });
  });
});
