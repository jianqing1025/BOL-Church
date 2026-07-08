import { describe, expect, it } from 'vitest';
import { liveRoomButtonState, shouldCloseLiveRoom } from './liveRoom';

describe('liveRoomButtonState', () => {
  it('直播中且有 videoId → enabled', () => {
    expect(liveRoomButtonState('live', 'abc123')).toBe('enabled');
  });
  it('直播中但 videoId 缺失 → disabled（暂时没画面可进）', () => {
    expect(liveRoomButtonState('live', null)).toBe('disabled');
  });
  it('离线 → disabled（置灰显示）', () => {
    expect(liveRoomButtonState('offline', null)).toBe('disabled');
  });
  it('回放 → hidden（不显示按钮）', () => {
    expect(liveRoomButtonState('replay', 'abc123')).toBe('hidden');
  });
});

describe('shouldCloseLiveRoom', () => {
  it('房间开着、直播结束（replay）→ 关', () => {
    expect(shouldCloseLiveRoom(true, 'replay', 'abc123')).toBe(true);
  });
  it('房间开着、切到 offline → 关', () => {
    expect(shouldCloseLiveRoom(true, 'offline', null)).toBe(true);
  });
  it('房间开着、直播中途丢失 videoId → 关', () => {
    expect(shouldCloseLiveRoom(true, 'live', null)).toBe(true);
  });
  it('房间开着、仍在直播 → 不关', () => {
    expect(shouldCloseLiveRoom(true, 'live', 'abc123')).toBe(false);
  });
  it('房间没开 → 永远不需要关', () => {
    expect(shouldCloseLiveRoom(false, 'offline', null)).toBe(false);
  });
});
