import { describe, it, expect } from 'vitest';
import { computeGiving, parseFeeConfig, DEFAULT_FEE_CONFIG } from './fee';

describe('parseFeeConfig', () => {
  it('把百分比字串轉成基點整數', () => {
    expect(parseFeeConfig({ percent: '2.2', fixedCents: '30' })).toEqual({ percentBp: 220, fixedCents: 30 });
  });

  it('缺值時回退到預設非營利費率', () => {
    expect(parseFeeConfig({})).toEqual(DEFAULT_FEE_CONFIG);
    expect(DEFAULT_FEE_CONFIG).toEqual({ percentBp: 220, fixedCents: 30 });
  });

  it('無法解析的值回退到預設，不丟例外', () => {
    expect(parseFeeConfig({ percent: 'abc', fixedCents: '' })).toEqual(DEFAULT_FEE_CONFIG);
  });

  it('空白字串（非空字串）也回退到預設，不會被 Number() 誤判成 0', () => {
    expect(parseFeeConfig({ percent: ' ', fixedCents: '30' })).toEqual({ percentBp: 220, fixedCents: 30 });
    expect(parseFeeConfig({ percent: '2.2', fixedCents: '  ' })).toEqual({ percentBp: 220, fixedCents: 30 });
    expect(parseFeeConfig({ percent: '   ', fixedCents: '\t' })).toEqual(DEFAULT_FEE_CONFIG);
  });

  it('四捨五入後落在或超過 10000 基點（等於或超過 100%）的費率回退到預設，而不是產生退化費率', () => {
    // 99.999 通過 percent < 100 這種檢查，但四捨五入後是 10000 基點 —— 必須用四捨五入後的值驗證
    expect(parseFeeConfig({ percent: '99.999', fixedCents: '30' })).toEqual(DEFAULT_FEE_CONFIG);
    expect(parseFeeConfig({ percent: '100', fixedCents: '30' })).toEqual(DEFAULT_FEE_CONFIG);
    expect(parseFeeConfig({ percent: '250', fixedCents: '30' })).toEqual(DEFAULT_FEE_CONFIG);
  });

  it('合法的字面 "0" 仍會解析成真正的 0，而不是回退到預設', () => {
    expect(parseFeeConfig({ percent: '0', fixedCents: '0' })).toEqual({ percentBp: 0, fixedCents: 0 });
  });
});

describe('computeGiving 不代付手續費', () => {
  it('總額等於本金，代付為 0', () => {
    expect(computeGiving(10000, false, DEFAULT_FEE_CONFIG)).toEqual({
      amountCents: 10000,
      coveredFeeCents: 0,
      grossCents: 10000,
    });
  });
});

describe('computeGiving 代付手續費', () => {
  it('$100 奉獻實刷 $102.56，教會實收 $100.00', () => {
    const result = computeGiving(10000, true, DEFAULT_FEE_CONFIG);
    expect(result).toEqual({ amountCents: 10000, coveredFeeCents: 256, grossCents: 10256 });

    // 教會實收 = 總額 - Stripe 實際收取的手續費
    const stripeFee = Math.round((result.grossCents * 220) / 10000) + 30;
    expect(result.grossCents - stripeFee).toBe(10000);
  });

  it('$1 奉獻（下限）教會仍實收足額', () => {
    const result = computeGiving(100, true, DEFAULT_FEE_CONFIG);
    const stripeFee = Math.round((result.grossCents * 220) / 10000) + 30;
    expect(result.grossCents - stripeFee).toBeGreaterThanOrEqual(100);
  });

  it('向上取整，永不讓教會少收', () => {
    // 逐一驗證一段金額區間，確保沒有任何一個值因為取整而短收
    for (let amount = 100; amount <= 20000; amount += 137) {
      const result = computeGiving(amount, true, DEFAULT_FEE_CONFIG);
      const stripeFee = Math.round((result.grossCents * 220) / 10000) + 30;
      expect(result.grossCents - stripeFee).toBeGreaterThanOrEqual(amount);
    }
  });

  it('恆等式 gross = amount + coveredFee 永遠成立', () => {
    for (const amount of [100, 999, 5000, 10000, 250000]) {
      for (const cover of [true, false]) {
        const r = computeGiving(amount, cover, DEFAULT_FEE_CONFIG);
        expect(r.grossCents).toBe(r.amountCents + r.coveredFeeCents);
      }
    }
  });

  it('計算全程為整數，不產生浮點值', () => {
    const r = computeGiving(3333, true, DEFAULT_FEE_CONFIG);
    expect(Number.isInteger(r.grossCents)).toBe(true);
    expect(Number.isInteger(r.coveredFeeCents)).toBe(true);
  });

  it('手動建構的退化 FeeConfig（percentBp >= 10000）應丟出例外，而不是回傳 Infinity', () => {
    expect(() => computeGiving(10000, true, { percentBp: 10000, fixedCents: 30 })).toThrow();
    expect(() => computeGiving(10000, true, { percentBp: 15000, fixedCents: 30 })).toThrow();
  });
});
