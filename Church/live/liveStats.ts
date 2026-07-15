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

// search.list 间歇性返回空。仅当上次在直播、本次搜索为空、且 liveStreamingDetails
// 无 actualEndTime 时,判为瞬时漏检(保持直播);有 actualEndTime 才算真结束。
export function decideStreamEnd(params: {
  searchVideoId: string | null;
  prevVideoId: string | null;
  prevIsLive: boolean;
  actualEndTime: string | null;
}): StreamEndDecision {
  if (params.searchVideoId) return 'live';
  if (params.prevIsLive && params.prevVideoId) {
    return params.actualEndTime ? 'ended' : 'transient-miss';
  }
  return 'ended';
}
