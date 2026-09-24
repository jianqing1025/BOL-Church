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
  const expired = !record || nowMs - record.windowStartMs > RATE_LIMIT_WINDOW_MS;
  if (expired) {
    return { allowed: true, nextWindowStartMs: nowMs, nextCount: 1 };
  }
  if (record.count >= RATE_LIMIT_MAX) {
    // 不累加：持續打擊不該讓視窗起點往後推，否則對方永遠出不了懲罰期
    return { allowed: false, nextWindowStartMs: record.windowStartMs, nextCount: record.count };
  }
  return { allowed: true, nextWindowStartMs: record.windowStartMs, nextCount: record.count + 1 };
}
