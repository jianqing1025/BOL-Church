/**
 * 每分鐘上限刻意放寬到 15。
 *
 * 這是小教會，主日崇拜後常有一群人在共用的教會 wifi 或電信 CGNAT 後面同時奉獻，
 * 對外看起來是同一個 IP。上限訂 5 的話，第六個要奉獻的人就被擋死且毫無出路 ——
 * 那是主日的常態流量，不是邊緣案例。
 *
 * 卡號測試要有價值得試上幾十到幾百次，15/分鐘仍然擋得住，而擋它的最後一道
 * 防線本來就是 Stripe Radar，不是這裡。寧可漏幾次也不能擋住真的要奉獻的人。
 */
export const RATE_LIMIT_MAX = 15;
export const RATE_LIMIT_WINDOW_MS = 60_000;

export type RateLimitRecord = {
  windowStartMs: number;
  count: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  nextWindowStartMs: number;
  nextCount: number;
};

export function evaluateRateLimit(record: RateLimitRecord | null, nowMs: number): RateLimitDecision {
  // 時間倒退時一律當作過期重來。window_start_ms 是上一次服務請求的 Cloudflare colo
  // 寫進 D1 的，各 colo 時鐘不保證彼此單調；若只判斷 `elapsed > 視窗長度`，
  // 負的 elapsed 永遠不會超過視窗，已達上限的記錄就永遠不會過期 —— 正常奉獻者
  // 會被無限期鎖死。寧可漏掉幾次限制也不能擋住真的要奉獻的人；擋卡號測試的
  // 最後一道防線是 Stripe Radar，不是這裡。
  const elapsed = record ? nowMs - record.windowStartMs : 0;
  const expired = !record || elapsed < 0 || elapsed > RATE_LIMIT_WINDOW_MS;
  if (expired) {
    return { allowed: true, nextWindowStartMs: nowMs, nextCount: 1 };
  }
  if (record.count >= RATE_LIMIT_MAX) {
    // 不累加：持續打擊不該讓視窗起點往後推，否則對方永遠出不了懲罰期
    return { allowed: false, nextWindowStartMs: record.windowStartMs, nextCount: record.count };
  }
  return { allowed: true, nextWindowStartMs: record.windowStartMs, nextCount: record.count + 1 };
}
