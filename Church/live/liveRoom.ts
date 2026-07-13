import type { LiveStreamPublicState } from '../types';

// 頁面 CTA（狀態卡右側主按鈕）三態：進入直播 / 查看回放 / 等待（置灰）
export type PageCta = 'enter-live' | 'watch-replay' | 'waiting';

type StreamStatus = LiveStreamPublicState['status'];

/** 教會所在時區——回放窗口的「週六凌晨十二點」以此為準。 */
export const CHURCH_TIME_ZONE = 'America/Los_Angeles';

/**
 * 回放窗口是否開放：直播結束後（週日）到週五 23:59 可看回放，
 * 週六（教會時區）全天關閉、切回等待開播。
 */
export function isReplayWindowOpen(now: Date, timeZone: string = CHURCH_TIME_ZONE): boolean {
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(now);
  return weekday !== 'Sat';
}

/**
 * 狀態卡主按鈕：
 *   live + videoId → enter-live（紅色可點）
 *   replay + videoId + 窗口開放 → watch-replay（藍色可點）
 *   其餘 → waiting（置灰「進入直播」）
 */
export function pageCtaState(status: StreamStatus, videoId: string | null, now: Date): PageCta {
  if (status === 'live') return videoId ? 'enter-live' : 'waiting';
  if (status === 'replay' && videoId && isReplayWindowOpen(now)) return 'watch-replay';
  return 'waiting';
}

/**
 * 房間自動關閉判定：只有 CTA 退化為 waiting（無直播也無可看回放）才關；
 * live ↔ watch-replay 之間切換時房間原地換模式，不關。
 */
export function shouldCloseLiveRoom(roomOpen: boolean, cta: PageCta): boolean {
  return roomOpen && cta === 'waiting';
}
