import type { LiveStreamPublicState } from '../types';

export type LiveRoomButtonState = 'hidden' | 'disabled' | 'enabled';

type StreamStatus = LiveStreamPublicState['status'];

/**
 * 「進入直播」按鈕三態：
 *   live + videoId → enabled（紅色可點）
 *   live 但缺 videoId / offline → disabled（置灰）
 *   replay → hidden（沒有直播可進）
 */
export function liveRoomButtonState(status: StreamStatus, videoId: string | null): LiveRoomButtonState {
  if (status === 'replay') return 'hidden';
  if (status === 'live' && videoId) return 'enabled';
  return 'disabled';
}

/** 直播結束或丟失 videoId 時，開着的房間應自動關閉退回直播頁。 */
export function shouldCloseLiveRoom(roomOpen: boolean, status: StreamStatus, videoId: string | null): boolean {
  return roomOpen && !(status === 'live' && !!videoId);
}
