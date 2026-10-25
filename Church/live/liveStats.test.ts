import { describe, it, expect } from 'vitest';
import { nextPeak, computeTotalOnline, boostLowOnlineTotal, decideStreamEnd, pickLiveVideo } from './liveStats';

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
  it('is ended when search still returns the video but it already has actualEndTime', () => {
    // OBS 停播後 search.list 索引會滯後數分鐘仍把它當直播返回；actualEndTime 才是真相。
    expect(decideStreamEnd({ searchVideoId: 'X', prevVideoId: 'X', prevIsLive: true, actualEndTime: '2026-06-28T18:00:00Z' })).toBe('ended');
  });
  it('is live when a new stream starts right after the previous one ended', () => {
    expect(decideStreamEnd({ searchVideoId: 'Y', prevVideoId: 'X', prevIsLive: false, actualEndTime: null })).toBe('live');
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

describe('pickLiveVideo', () => {
  it('finds the stream really on air behind ones that already ended (2026-10-25: Live, Live, Live 2)', () => {
    expect(pickLiveVideo([
      { videoId: 'plpI0-rXPLo', actualStartTime: '2026-10-25T17:08:44Z', actualEndTime: '2026-10-25T17:15:38Z' },
      { videoId: 'Lyn8GoQA9gM', actualStartTime: '2026-10-25T17:17:13Z', actualEndTime: '2026-10-25T17:19:03Z' },
      { videoId: 'xoM6L3N3BS4', actualStartTime: '2026-10-25T17:19:29Z', actualEndTime: null },
    ])).toBe('xoM6L3N3BS4');
  });
  it('is null when everything found has ended, or has not started yet', () => {
    expect(pickLiveVideo([{ videoId: 'A', actualStartTime: '2026-10-25T17:00:00Z', actualEndTime: '2026-10-25T17:10:00Z' }])).toBeNull();
    expect(pickLiveVideo([{ videoId: 'U', actualStartTime: null, actualEndTime: null }])).toBeNull();
    expect(pickLiveVideo([])).toBeNull();
  });
  it('takes the latest start when two are on air', () => {
    expect(pickLiveVideo([
      { videoId: 'early', actualStartTime: '2026-10-25T17:00:00Z', actualEndTime: null },
      { videoId: 'late', actualStartTime: '2026-10-25T17:20:00Z', actualEndTime: null },
    ])).toBe('late');
  });
});
