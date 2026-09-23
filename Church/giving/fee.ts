/**
 * 奉獻金額與手續費計算。
 *
 * 全程以「分」為單位的整數運算，費率以基點（basis point，萬分之一）表示，
 * 不使用浮點數 —— 報稅金額不容許 0.1 + 0.2 !== 0.3 這種誤差。
 */

export type FeeConfig = {
  /** 費率基點。2.2% = 220 */
  percentBp: number;
  /** 固定費用（分）。$0.30 = 30 */
  fixedCents: number;
};

/** Stripe 美國非營利費率：2.2% + $0.30 */
export const DEFAULT_FEE_CONFIG: FeeConfig = { percentBp: 220, fixedCents: 30 };

const BP_DENOMINATOR = 10000;

/** 從 Worker 環境變數（字串）解析費率設定，任何無法解析的值都回退到預設。 */
export function parseFeeConfig(env: { percent?: string; fixedCents?: string }): FeeConfig {
  // 空字串會被 Number() 轉成 0，必須排除，否則無法區分「缺值」與「填 0」
  const percent = env.percent ? Number(env.percent) : NaN;
  const fixed = env.fixedCents ? Number(env.fixedCents) : NaN;
  const percentBp = Number.isFinite(percent) && percent >= 0 && percent < 100
    ? Math.round(percent * 100)
    : DEFAULT_FEE_CONFIG.percentBp;
  const fixedCents = Number.isInteger(fixed) && fixed >= 0
    ? fixed
    : DEFAULT_FEE_CONFIG.fixedCents;
  return { percentBp, fixedCents };
}

export type GivingAmounts = {
  /** 奉獻本金（分） */
  amountCents: number;
  /** 奉獻者自願加付的手續費（分）；不代付時為 0 */
  coveredFeeCents: number;
  /** 實際刷卡總額（分） */
  grossCents: number;
};

/**
 * 計算實刷總額。
 *
 * 代付手續費時，要讓教會實收等於本金，必須解這條方程式：
 *   gross - (gross × rate + fixed) = amount
 *   => gross = (amount + fixed) / (1 - rate)
 *
 * 不是 amount × (1 + rate) —— 那會少收，因為手續費是對「總額」而非本金收取的。
 * 除法向上取整，寧可多收一分也不讓教會短收。
 */
export function computeGiving(amountCents: number, coverFee: boolean, config: FeeConfig): GivingAmounts {
  if (!coverFee) {
    return { amountCents, coveredFeeCents: 0, grossCents: amountCents };
  }
  const numerator = (amountCents + config.fixedCents) * BP_DENOMINATOR;
  const denominator = BP_DENOMINATOR - config.percentBp;
  const grossCents = Math.ceil(numerator / denominator);
  return { amountCents, coveredFeeCents: grossCents - amountCents, grossCents };
}
