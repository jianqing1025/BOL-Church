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

/**
 * 從 Worker 環境變數（字串）解析費率設定，任何無法解析的值都回退到預設。
 * 此函式永遠不會丟出例外 —— 解析失敗一律回退到預設值。
 */
export function parseFeeConfig(env: { percent?: string; fixedCents?: string }): FeeConfig {
  // 空字串或空白字串都會被 Number() 轉成 0，必須先 trim 再檢查是否為空，
  // 否則無法區分「缺值/空白」與「使用者真的填了 0」。
  const rawPercent = env.percent?.trim();
  const percent = rawPercent ? Number(rawPercent) : NaN;
  // 驗證要用「四捨五入後」的基點值，而不是四捨五入前的百分比 —— 例如 99.999%
  // 用 `percent < 100` 檢查會通過，但四捨五入後會變成 10000 基點，
  // 導致 computeGiving 除以零。基點值必須落在 [0, 10000) 才是合法費率。
  const percentBp = Number.isFinite(percent) && percent >= 0 ? Math.round(percent * 100) : NaN;

  const rawFixed = env.fixedCents?.trim();
  const fixed = rawFixed ? Number(rawFixed) : NaN;

  return {
    percentBp: Number.isInteger(percentBp) && percentBp >= 0 && percentBp < BP_DENOMINATOR
      ? percentBp
      : DEFAULT_FEE_CONFIG.percentBp,
    fixedCents: Number.isInteger(fixed) && fixed >= 0
      ? fixed
      : DEFAULT_FEE_CONFIG.fixedCents,
  };
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
 *
 * `config` 不透過 parseFeeConfig 也可能被手動建構，因此這裡仍需防禦：
 * percentBp >= 10000 會讓分母歸零或變負，寧可丟出例外，也不要讓一個付款金額
 * 悄悄變成 Infinity 或負數送進 Stripe。
 */
export function computeGiving(amountCents: number, coverFee: boolean, config: FeeConfig): GivingAmounts {
  if (!coverFee) {
    return { amountCents, coveredFeeCents: 0, grossCents: amountCents };
  }
  const denominator = BP_DENOMINATOR - config.percentBp;
  if (denominator <= 0) {
    throw new Error(`Invalid FeeConfig: percentBp (${config.percentBp}) must be less than ${BP_DENOMINATOR}`);
  }
  const numerator = (amountCents + config.fixedCents) * BP_DENOMINATOR;
  const grossCents = Math.ceil(numerator / denominator);
  return { amountCents, coveredFeeCents: grossCents - amountCents, grossCents };
}
