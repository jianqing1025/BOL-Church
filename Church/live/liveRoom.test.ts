import { describe, expect, it } from 'vitest';
import { pageCtaState, isReplayWindowOpen, shouldCloseLiveRoom } from './liveRoom';

// 2026-07-10 是週五、07-11 週六、07-12 週日（America/Los_Angeles，PDT = UTC-7）
const FRI_NOON = new Date('2026-07-10T12:00:00-07:00');
const SAT_NOON = new Date('2026-07-11T12:00:00-07:00');
const SUN_NOON = new Date('2026-07-12T12:00:00-07:00');

describe('isReplayWindowOpen', () => {
  it('週五 → 開放', () => {
    expect(isReplayWindowOpen(FRI_NOON)).toBe(true);
  });
  it('週六 → 關閉', () => {
    expect(isReplayWindowOpen(SAT_NOON)).toBe(false);
  });
  it('週日 → 開放（直播剛結束大家補看）', () => {
    expect(isReplayWindowOpen(SUN_NOON)).toBe(true);
  });
  it('UTC 跨日邊界：UTC 週六 05:00 = LA 週五 22:00 → 開放', () => {
    expect(isReplayWindowOpen(new Date('2026-07-11T05:00:00Z'))).toBe(true);
  });
  it('UTC 跨日邊界：UTC 週六 07:00 = LA 週六 00:00 → 關閉', () => {
    expect(isReplayWindowOpen(new Date('2026-07-11T07:00:00Z'))).toBe(false);
  });
  it('UTC 跨日邊界：UTC 週日 06:59 = LA 週六 23:59 → 關閉', () => {
    expect(isReplayWindowOpen(new Date('2026-07-12T06:59:00Z'))).toBe(false);
  });
});

describe('pageCtaState', () => {
  it('直播中且有 videoId → enter-live（與星期無關）', () => {
    expect(pageCtaState('live', 'abc123', SAT_NOON)).toBe('enter-live');
  });
  it('直播中但缺 videoId → waiting', () => {
    expect(pageCtaState('live', null, FRI_NOON)).toBe('waiting');
  });
  it('回放 + 窗口內（週五）→ watch-replay', () => {
    expect(pageCtaState('replay', 'abc123', FRI_NOON)).toBe('watch-replay');
  });
  it('回放 + 週六 → waiting（窗口已關）', () => {
    expect(pageCtaState('replay', 'abc123', SAT_NOON)).toBe('waiting');
  });
  it('回放但缺 videoId → waiting', () => {
    expect(pageCtaState('replay', null, FRI_NOON)).toBe('waiting');
  });
  it('離線 → waiting', () => {
    expect(pageCtaState('offline', null, SUN_NOON)).toBe('waiting');
  });
});

describe('shouldCloseLiveRoom', () => {
  it('房間開着、CTA 退化為 waiting → 關', () => {
    expect(shouldCloseLiveRoom(true, 'waiting')).toBe(true);
  });
  it('房間開着、仍在直播 → 不關', () => {
    expect(shouldCloseLiveRoom(true, 'enter-live')).toBe(false);
  });
  it('房間開着、直播結束切回放窗口 → 不關（原地切回放模式）', () => {
    expect(shouldCloseLiveRoom(true, 'watch-replay')).toBe(false);
  });
  it('房間沒開 → 永遠不需要關', () => {
    expect(shouldCloseLiveRoom(false, 'waiting')).toBe(false);
  });
});
