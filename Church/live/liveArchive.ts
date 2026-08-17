// 純函數：直播歸檔的收錄規則。不依賴 Worker / D1，可單元測試。

/**
 * 未達此長度的一律當作測試流／片頭，不收進直播列表。
 * 正式崇拜實測落在 30～120 分鐘；測試流多半 1～16 分鐘，10 分鐘是安全的分界。
 */
export const MIN_LIVE_BROADCAST_SECONDS = 600;

export type DayVideo = {
  videoId: string;
  durationSeconds: number | null | undefined;
};

/** 時長未知（VOD 還在處理）一律不合格 —— 呼叫端要當「稍後重試」而不是「淘汰」。 */
export function qualifiesAsLiveBroadcast(durationSeconds: number | null | undefined): boolean {
  return typeof durationSeconds === 'number'
    && Number.isFinite(durationSeconds)
    && durationSeconds >= MIN_LIVE_BROADCAST_SECONDS;
}

/**
 * 當天的「代表」直播：合格影片中最長的一支（直播頁的回放指向它）。
 * 同長度時取先傳入的那支——呼叫端以穩定順序（youtube_id）傳入即可得到穩定結果。
 * 其餘合格影片仍留在直播列表裡，只是不當代表。
 */
export function pickDayRepresentative(videos: DayVideo[]): string | null {
  let best: DayVideo | null = null;
  for (const video of videos) {
    if (!qualifiesAsLiveBroadcast(video.durationSeconds)) continue;
    if (!best || (video.durationSeconds as number) > (best.durationSeconds as number)) best = video;
  }
  return best ? best.videoId : null;
}
