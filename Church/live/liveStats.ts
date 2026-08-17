// 纯函数,不依赖 Worker / D1,可单元测试。直播在线统计与结束判定辅助。

export function nextPeak(prev: number | null | undefined, current: number | null | undefined): number | null {
  const p = prev ?? null;
  const c = current ?? null;
  if (p == null) return c;
  if (c == null) return p;
  return Math.max(p, c);
}

export function computeTotalOnline(websiteTotal: number, youtubePeak: number | null | undefined): number {
  return websiteTotal + (youtubePeak ?? 0);
}

/**
 * Give very small archived live-stream totals a modest one-time display boost.
 * The boosted value is persisted when the stream is archived, so it does not
 * change whenever the public endpoint is polled.
 */
export function boostLowOnlineTotal(total: number, random: () => number = Math.random): number {
  if (total >= 5) return total;
  return total + 3 + Math.floor(random() * 4);
}

export type StreamEndDecision = 'live' | 'ended' | 'transient-miss';

// search.list 兩個方向都不可靠,一律以 liveStreamingDetails.actualEndTime 為準:
//   - 間歇性返回空:上次在直播、本次搜索為空、但無 actualEndTime → 瞬時漏檢,保持直播。
//   - 索引滯後:OBS 已停播數分鐘,search 仍把它當直播返回 → 有 actualEndTime 即判結束。
// actualEndTime 必須是「本次判定的那支影片」(有搜到就是它,沒搜到就是上次那支)的。
export function decideStreamEnd(params: {
  searchVideoId: string | null;
  prevVideoId: string | null;
  prevIsLive: boolean;
  actualEndTime: string | null;
}): StreamEndDecision {
  if (params.searchVideoId) return params.actualEndTime ? 'ended' : 'live';
  if (params.prevIsLive && params.prevVideoId) {
    return params.actualEndTime ? 'ended' : 'transient-miss';
  }
  return 'ended';
}
