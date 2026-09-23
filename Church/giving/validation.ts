import { isValidCategory } from './categories';

/** 下限 $1.00 —— 再低手續費就比奉獻本身還高，沒有意義 */
export const MIN_AMOUNT_CENTS = 100;
/** 上限 $25,000 —— 防呆，更大額請走電匯（奉獻頁上已列電匯資訊） */
export const MAX_AMOUNT_CENTS = 2_500_000;

export const MAX_NAME_LENGTH = 100;
export const MAX_NOTE_LENGTH = 1000;

export type GivingInput = {
  amountCents: number;
  category: string;
  donorName: string;
  donorEmail: string;
  coverFee: boolean;
  note: string;
};

// `field`/`message` on the ok branch and `value` on the fail branch are declared as
// optional `undefined` so that property access still type-checks even when TS can't
// narrow the union (this project's tsconfig has strictNullChecks off, under which TS
// fails to narrow a boolean-discriminated union to its `false` member via truthy/falsy
// control flow — e.g. `if (result.ok) throw ...;` followed by `result.field` — even
// though the equivalent `result.ok === false` check narrows fine).
export type ValidationResult =
  | { ok: true; value: GivingInput; field?: undefined; message?: undefined }
  | { ok: false; field: string; message: string; value?: undefined };

/** 保守的 email 格式檢查：本地部分、@、網域、至少一個點、TLD 至少兩碼。 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

function fail(field: string, message: string): ValidationResult {
  return { ok: false, field, message };
}

/**
 * 驗證並正規化奉獻表單輸入。
 *
 * 注意這裡「不」接受任何總額或手續費欄位 —— 那些一律由伺服器用 computeGiving 算，
 * 否則有人可以改 request 用 $1 換一張 $500 的報稅收據。
 */
export function validateGivingInput(raw: unknown, categories: readonly string[]): ValidationResult {
  if (typeof raw !== 'object' || raw === null) {
    return fail('body', '請求格式不正確');
  }
  const input = raw as Record<string, unknown>;

  const amountCents = input.amountCents;
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents)) {
    return fail('amountCents', '金額格式不正確');
  }
  if (amountCents < MIN_AMOUNT_CENTS) {
    return fail('amountCents', `最低奉獻金額為 $${(MIN_AMOUNT_CENTS / 100).toFixed(2)}`);
  }
  if (amountCents > MAX_AMOUNT_CENTS) {
    return fail('amountCents', `單筆線上奉獻上限為 $${(MAX_AMOUNT_CENTS / 100).toLocaleString('en-US')}，更大額請與教會聯絡以電匯方式奉獻`);
  }

  const category = typeof input.category === 'string' ? input.category.trim() : '';
  if (!isValidCategory(category, categories)) {
    return fail('category', '請選擇奉獻用途');
  }

  const donorName = typeof input.donorName === 'string' ? input.donorName.trim() : '';
  if (donorName.length === 0) {
    return fail('donorName', '請填寫姓名');
  }
  if (donorName.length > MAX_NAME_LENGTH) {
    return fail('donorName', '姓名過長');
  }

  const donorEmail = typeof input.donorEmail === 'string' ? input.donorEmail.trim().toLowerCase() : '';
  if (donorEmail.length === 0) {
    return fail('donorEmail', '請填寫電子郵件，我們會寄送奉獻收據');
  }
  if (!EMAIL_PATTERN.test(donorEmail)) {
    return fail('donorEmail', '電子郵件格式不正確');
  }

  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (note.length > MAX_NOTE_LENGTH) {
    return fail('note', `留言請勿超過 ${MAX_NOTE_LENGTH} 字`);
  }

  return {
    ok: true,
    value: { amountCents, category, donorName, donorEmail, coverFee: input.coverFee === true, note },
  };
}
