import { describe, it, expect } from 'vitest';
import { qualifiesAsLiveBroadcast, pickDayRepresentative, MIN_LIVE_BROADCAST_SECONDS } from './liveArchive';

describe('qualifiesAsLiveBroadcast', () => {
  it('accepts exactly the threshold and above', () => {
    expect(qualifiesAsLiveBroadcast(MIN_LIVE_BROADCAST_SECONDS)).toBe(true);
    expect(qualifiesAsLiveBroadcast(5321)).toBe(true); // 88:41 的正式崇拜
  });
  it('rejects test streams below the threshold', () => {
    expect(qualifiesAsLiveBroadcast(599)).toBe(false);
    expect(qualifiesAsLiveBroadcast(498)).toBe(false); // 8:18 的測試流
    expect(qualifiesAsLiveBroadcast(33)).toBe(false);
    expect(qualifiesAsLiveBroadcast(0)).toBe(false);
  });
  it('rejects unknown duration (VOD 還沒處理完 → 呼叫端稍後重試)', () => {
    expect(qualifiesAsLiveBroadcast(null)).toBe(false);
    expect(qualifiesAsLiveBroadcast(undefined)).toBe(false);
    expect(qualifiesAsLiveBroadcast(NaN)).toBe(false);
  });
});

describe('pickDayRepresentative', () => {
  it('picks the longest qualifying video of the day', () => {
    // 2026-08-16 實況：三支測試 + 一支 88 分鐘的正式崇拜
    expect(pickDayRepresentative([
      { videoId: 'DQbz76PQYCA', durationSeconds: 498 },
      { videoId: 'Dc7XY65vGY0', durationSeconds: 949 },
      { videoId: 'of2CMh0yxJ8', durationSeconds: 1901 },
      { videoId: 'GNdOicC5Ntc', durationSeconds: 5321 },
    ])).toBe('GNdOicC5Ntc');
  });
  it('never picks a video below the threshold', () => {
    expect(pickDayRepresentative([
      { videoId: 'short', durationSeconds: 599 },
      { videoId: 'ok', durationSeconds: 600 },
    ])).toBe('ok');
  });
  it('returns null when every candidate is too short', () => {
    expect(pickDayRepresentative([
      { videoId: 'a', durationSeconds: 33 },
      { videoId: 'b', durationSeconds: null },
    ])).toBeNull();
  });
  it('returns null for an empty day', () => {
    expect(pickDayRepresentative([])).toBeNull();
  });
  it('keeps the first on a tie so repeated runs stay stable', () => {
    expect(pickDayRepresentative([
      { videoId: 'first', durationSeconds: 3600 },
      { videoId: 'second', durationSeconds: 3600 },
    ])).toBe('first');
  });
});
