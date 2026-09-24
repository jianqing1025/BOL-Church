/**
 * 建立 PaymentIntent 的速率限制。
 *
 * 目的不是擋 DDoS，而是避免奉獻端點被拿來當卡號測試工具（carding）——
 * 攻擊者用大量被竊卡號逐一嘗試小額付款來篩出可用的卡。
 * Stripe Radar 會擋一部分，但不該讓教會的端點成為第一道免費關卡。
 */

export const RATE_LIMIT_MAX = 5;
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
