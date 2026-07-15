import { describe, it, expect } from 'vitest';
import { nextPeak, computeTotalOnline, boostLowOnlineTotal, decideStreamEnd } from './liveStats';

describe('nextPeak', () => {
  it('returns current when no prior peak', () => {
    expect(nextPeak(null, 5)).toBe(5);
    expect(nextPeak(undefined, 0)).toBe(0);
  });
  it('keeps prior peak when current is null', () => {
    expect(nextPeak(7, null)).toBe(7);
  });
  it('takes the max', () => {
    expect(nextPeak(7, 3)).toBe(7);
    expect(nextPeak(3, 7)).toBe(7);
  });
  it('returns null when both missing', () => {
    expect(nextPeak(null, null)).toBeNull();
  });
});

describe('computeTotalOnline', () => {
  it('adds website total and youtube peak', () => {
    expect(computeTotalOnline(128, 177)).toBe(305);
  });
  it('treats missing youtube peak as 0', () => {
    expect(computeTotalOnline(128, null)).toBe(128);
    expect(computeTotalOnline(0, undefined)).toBe(0);
  });
});

describe('boostLowOnlineTotal', () => {
  it('adds between 3 and 6 when the total is below 5', () => {
    expect(boostLowOnlineTotal(0, () => 0)).toBe(3);
    expect(boostLowOnlineTotal(4, () => 0.999999)).toBe(10);
  });

  it('does not change totals of 5 or more', () => {
    expect(boostLowOnlineTotal(5, () => 0)).toBe(5);
    expect(boostLowOnlineTotal(20, () => 0.5)).toBe(20);
  });
});

describe('decideStreamEnd', () => {
  it('is live when search returns a video', () => {
    expect(decideStreamEnd({ searchVideoId: 'X', prevVideoId: 'X', prevIsLive: true, actualEndTime: null })).toBe('live');
  });
  it('is transient-miss when search empty but no actualEndTime', () => {
    expect(decideStreamEnd({ searchVideoId: null, prevVideoId: 'X', prevIsLive: true, actualEndTime: null })).toBe('transient-miss');
  });
  it('is ended when search empty and actualEndTime present', () => {
    expect(decideStreamEnd({ searchVideoId: null, prevVideoId: 'X', prevIsLive: true, actualEndTime: '2026-06-28T18:00:00Z' })).toBe('ended');
  });
  it('is ended when nothing was live', () => {
    expect(decideStreamEnd({ searchVideoId: null, prevVideoId: null, prevIsLive: false, actualEndTime: null })).toBe('ended');
  });
});
