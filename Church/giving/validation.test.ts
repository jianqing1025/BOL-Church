import { describe, it, expect } from 'vitest';
import { validateGivingInput, MIN_AMOUNT_CENTS, MAX_AMOUNT_CENTS } from './validation';
import { DEFAULT_CATEGORIES } from './categories';

const valid = {
  amountCents: 5000,
  category: '什一',
  donorName: '王小明',
  donorEmail: 'test@example.com',
  coverFee: true,
  note: '感謝神',
};

function run(overrides: Record<string, unknown> = {}) {
  return validateGivingInput({ ...valid, ...overrides }, DEFAULT_CATEGORIES);
}

describe('validateGivingInput 合法輸入', () => {
  it('通過並回傳正規化後的值', () => {
    const result = run();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.value).toEqual({
      amountCents: 5000,
      category: '什一',
      donorName: '王小明',
      donorEmail: 'test@example.com',
      coverFee: true,
      note: '感謝神',
    });
  });

  it('姓名與 email 去除前後空白，email 轉小寫', () => {
    const result = run({ donorName: '  王小明  ', donorEmail: '  TEST@Example.COM ' });
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.donorName).toBe('王小明');
    expect(result.value.donorEmail).toBe('test@example.com');
  });

  it('留言可省略，正規化為空字串', () => {
    const result = run({ note: undefined });
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.note).toBe('');
  });

  it('coverFee 非布林值時視為 false，不報錯', () => {
    const result = run({ coverFee: 'yes' });
    if (!result.ok) throw new Error('expected ok');
    expect(result.value.coverFee).toBe(false);
  });
});

describe('validateGivingInput 金額', () => {
  it('低於下限被拒', () => {
    expect(run({ amountCents: MIN_AMOUNT_CENTS - 1 }).ok).toBe(false);
  });

  it('恰好等於下限通過', () => {
    expect(run({ amountCents: MIN_AMOUNT_CENTS }).ok).toBe(true);
  });

  it('恰好等於上限通過', () => {
    expect(run({ amountCents: MAX_AMOUNT_CENTS }).ok).toBe(true);
  });

  it('高於上限被拒', () => {
    expect(run({ amountCents: MAX_AMOUNT_CENTS + 1 }).ok).toBe(false);
  });

  it('負數被拒', () => {
    expect(run({ amountCents: -5000 }).ok).toBe(false);
  });

  it('零被拒', () => {
    expect(run({ amountCents: 0 }).ok).toBe(false);
  });

  it('非整數被拒（分不能有小數）', () => {
    expect(run({ amountCents: 50.5 }).ok).toBe(false);
  });

  it('NaN 被拒', () => {
    expect(run({ amountCents: Number.NaN }).ok).toBe(false);
  });

  it('Infinity 被拒', () => {
    expect(run({ amountCents: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });

  it('字串被拒', () => {
    expect(run({ amountCents: '5000' }).ok).toBe(false);
  });

  it('下限為 $1、上限為 $25,000', () => {
    expect(MIN_AMOUNT_CENTS).toBe(100);
    expect(MAX_AMOUNT_CENTS).toBe(2_500_000);
  });
});

describe('validateGivingInput 其他欄位', () => {
  it('姓名必填', () => {
    expect(run({ donorName: '' }).ok).toBe(false);
    expect(run({ donorName: '   ' }).ok).toBe(false);
    expect(run({ donorName: undefined }).ok).toBe(false);
  });

  it('姓名過長被拒', () => {
    expect(run({ donorName: 'a'.repeat(101) }).ok).toBe(false);
  });

  it('email 必填且需通過格式檢查', () => {
    expect(run({ donorEmail: '' }).ok).toBe(false);
    expect(run({ donorEmail: 'not-an-email' }).ok).toBe(false);
    expect(run({ donorEmail: 'missing@domain' }).ok).toBe(false);
    expect(run({ donorEmail: '@example.com' }).ok).toBe(false);
    expect(run({ donorEmail: 'a b@example.com' }).ok).toBe(false);
  });

  it('分類必須在允許清單內', () => {
    expect(run({ category: '賭金' }).ok).toBe(false);
    expect(run({ category: '' }).ok).toBe(false);
  });

  it('留言超過 1000 字被拒', () => {
    expect(run({ note: 'a'.repeat(1001) }).ok).toBe(false);
    expect(run({ note: 'a'.repeat(1000) }).ok).toBe(true);
  });

  it('錯誤訊息指出是哪個欄位', () => {
    const result = run({ donorEmail: 'bad' });
    if (result.ok) throw new Error('expected failure');
    expect(result.field).toBe('donorEmail');
    expect(result.message.length).toBeGreaterThan(0);
  });
});
