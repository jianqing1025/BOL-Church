# Stripe 線上奉獻第一期（一次性奉獻）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把奉獻頁上的假表單換成真正能收款的 Stripe 一次性奉獻，資料完整落地到 D1，並提供收據信、管理後台檢視與 CSV 匯出。

**Architecture:** 所有可測邏輯（手續費計算、輸入驗證、webhook 驗簽、速率限制、CSV 組裝）放進新的 `Church/giving/` 模組目錄，各配 `.test.ts`，與現有 `mailbox/`、`live/` 的做法一致；`server.ts` 只負責路由與 D1 存取。金額一律用整數「分」運算，手續費用基點（basis point）整數算式避免浮點誤差。信任邊界：金額由伺服器決定，只有通過簽章驗證的 webhook 能把奉獻標記為 `completed`。

**Tech Stack:** Cloudflare Workers + D1 + KV、React 19 + Vite、`@stripe/stripe-js` + `@stripe/react-stripe-js`（前端）、Stripe REST API（後端直接用 `fetch`，不引入 Node SDK）、Resend（信件）、vitest（測試）

**設計依據:** `docs/superpowers/specs/2026-09-23-stripe-giving-phase1-design.md`

**工作目錄:** 所有指令都在 `Church/` 下執行。

**全計畫適用的型別陷阱：** 本專案 `Church/tsconfig.json` 沒有開 `strict`，所以 `strictNullChecks` 是關的。在這個設定下，TypeScript **不會**用真假值判斷把可辨識聯合收斂到分支 —— `if (r.ok) throw` 之後存取 `r.field`，或 `if (!r.ok) { r.error }`，兩種寫法都會報 `TS2339: Property does not exist`。（已實測確認：同一段程式碼加上 `--strict` 就編得過。）

因此本計畫中每一個 `{ ok: true; ... } | { ok: false; ... }` 形狀的型別，都要在兩個分支補上對方欄位的 `?: undefined` 宣告。這是純型別層的寫法，執行期毫無差異。不要改 `tsconfig.json` —— 對既有程式碼的影響範圍太大。

---

## File Structure

### 新增

| 檔案 | 責任 |
|---|---|
| `Church/giving/fee.ts` | 手續費與實刷總額計算（純函式） |
| `Church/giving/fee.test.ts` | 同上測試 |
| `Church/giving/validation.ts` | 奉獻表單輸入驗證與正規化（純函式） |
| `Church/giving/validation.test.ts` | 同上測試 |
| `Church/giving/stripeWebhook.ts` | Stripe 簽章驗證與事件解析（純函式 + WebCrypto） |
| `Church/giving/stripeWebhook.test.ts` | 同上測試 |
| `Church/giving/rateLimit.ts` | 速率限制視窗判定（純函式） |
| `Church/giving/rateLimit.test.ts` | 同上測試 |
| `Church/giving/categories.ts` | 用途分類預設值與解析 |
| `Church/giving/categories.test.ts` | 同上測試 |
| `Church/giving/csv.ts` | 奉獻記錄轉 CSV（純函式） |
| `Church/giving/csv.test.ts` | 同上測試 |
| `Church/giving/stripeApi.ts` | 呼叫 Stripe REST API 建立 PaymentIntent |
| `Church/giving/receiptEmail.ts` | 感謝信 HTML 組裝（純函式） |
| `Church/giving/receiptEmail.test.ts` | 同上測試 |
| `Church/migrations/0018_donations_stripe.sql` | 重建 `donations` 表 + 建立 `giving_rate_limit` 表 |
| `Church/components/giving/StripeGivingForm.tsx` | 表單容器：欄位狀態、送出、Stripe Elements 掛載 |
| `Church/components/giving/AmountSelector.tsx` | 金額快捷鈕與自訂金額 |
| `Church/components/giving/FeeCoverToggle.tsx` | 代付手續費勾選 + 即時金額顯示 |
| `Church/components/giving/GivingResult.tsx` | 成功／處理中／失敗三種結果畫面 |
| `Church/components/giving/useGivingConfig.ts` | 取 `/api/giving/config` |
| `Church/components/giving/RecurringComingSoon.tsx` | 「定期」分頁的過渡內容 |

### 修改

| 檔案 | 改動 |
|---|---|
| `Church/migrations/` 目錄 | 新增 migration（編號接續現有最大號） |
| `Church/server.ts` | `Env` 加 Stripe 設定；新增 4 條 `/api/giving/*` 路由 + 1 條 admin CSV 路由；移除 `POST /api/donations`；`DonationRow`/`mapDonation` 改為新 schema；`handleBootstrap` 的 donations 查詢改為 owner-only |
| `Church/wrangler.toml` | `[vars]` 加 Stripe 公開設定 |
| `Church/wrangler.example.toml` | 同步加上，值留佔位 |
| `Church/vitest.config.ts` | `include` 加 `giving/**/*.test.ts` |
| `Church/package.json` | 加 `@stripe/stripe-js`、`@stripe/react-stripe-js` |
| `Church/data.ts` | `Donation` 型別改為新 schema |
| `Church/api.ts` | 移除 `submitDonation`（奉獻端點為公開 API，由元件直接 `fetch`，不經過需要 session 的 `api.ts` 包裝） |
| `Church/context/AdminContext.tsx` | 移除 `submitDonation` |
| `Church/components/GivingPage.tsx` | 移除內嵌 `GivingForm`，改接新元件；「定期」改為過渡畫面 |
| `Church/components/Giving.tsx` | 刪除（已無用途） |
| `Church/constants/translations.ts` | 新增 `giving.*` 文案，移除寫死英文 |
| `Church/components/AdminDashboard.tsx` | 奉獻列表改為新欄位 + 篩選 + CSV 匯出按鈕 |

---

## Task 1: 手續費計算模組

**Files:**
- Create: `Church/giving/fee.ts`
- Test: `Church/giving/fee.test.ts`
- Modify: `Church/vitest.config.ts`

- [ ] **Step 1: 讓 vitest 找得到新目錄**

修改 `Church/vitest.config.ts`，在 `include` 陣列加一行（放在 `'snapshot/**/*.test.ts',` 之後）：

```ts
      'giving/**/*.test.ts',
```

- [ ] **Step 2: 寫失敗的測試**

建立 `Church/giving/fee.test.ts`：

```ts
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
});
```

- [ ] **Step 3: 執行測試確認失敗**

```bash
npx vitest run giving/fee.test.ts
```

預期：FAIL，`Failed to resolve import "./fee"`

- [ ] **Step 4: 寫實作**

建立 `Church/giving/fee.ts`：

```ts
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
  const percent = Number(env.percent);
  const fixed = Number(env.fixedCents);
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
```

- [ ] **Step 5: 執行測試確認通過**

```bash
npx vitest run giving/fee.test.ts
```

預期：PASS，所有測試通過

- [ ] **Step 6: Commit**

```bash
git add Church/giving/fee.ts Church/giving/fee.test.ts Church/vitest.config.ts
git commit -m "feat(church): 奉獻手續費計算模組（整數基點運算）"
```

---

## Task 2: 用途分類

**Files:**
- Create: `Church/giving/categories.ts`
- Test: `Church/giving/categories.test.ts`

- [ ] **Step 1: 寫失敗的測試**

建立 `Church/giving/categories.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_CATEGORIES, parseCategories, isValidCategory } from './categories';

describe('DEFAULT_CATEGORIES', () => {
  it('包含教會指定的五類，且為繁體中文', () => {
    expect(DEFAULT_CATEGORIES).toEqual(['什一', '感恩', '建堂', '宣教', '愛心']);
  });
});

describe('parseCategories', () => {
  it('解析 settings 存的 JSON 字串', () => {
    expect(parseCategories('["什一","建堂"]')).toEqual(['什一', '建堂']);
  });

  it('null 時回退到預設', () => {
    expect(parseCategories(null)).toEqual(DEFAULT_CATEGORIES);
  });

  it('壞掉的 JSON 回退到預設，不丟例外', () => {
    expect(parseCategories('{not json')).toEqual(DEFAULT_CATEGORIES);
  });

  it('空陣列回退到預設（沒有分類的奉獻頁無法運作）', () => {
    expect(parseCategories('[]')).toEqual(DEFAULT_CATEGORIES);
  });

  it('過濾掉非字串與空白項目', () => {
    expect(parseCategories('["什一", 123, "", "  ", "建堂"]')).toEqual(['什一', '建堂']);
  });
});

describe('isValidCategory', () => {
  it('清單內的分類通過', () => {
    expect(isValidCategory('什一', DEFAULT_CATEGORIES)).toBe(true);
  });

  it('清單外的分類被拒', () => {
    expect(isValidCategory('賭金', DEFAULT_CATEGORIES)).toBe(false);
  });

  it('空值被拒', () => {
    expect(isValidCategory('', DEFAULT_CATEGORIES)).toBe(false);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx vitest run giving/categories.test.ts
```

預期：FAIL，`Failed to resolve import "./categories"`

- [ ] **Step 3: 寫實作**

建立 `Church/giving/categories.ts`：

```ts
/** 奉獻用途分類。存在 settings 表的 `giving.categories`，此處為 fallback 與解析邏輯。 */

export const DEFAULT_CATEGORIES = ['什一', '感恩', '建堂', '宣教', '愛心'] as const;

/** settings 表中存放分類清單的 key */
export const CATEGORIES_SETTING_KEY = 'giving.categories';

/**
 * 解析 settings.value_json。任何異常都回退到預設 ——
 * 奉獻頁沒有分類就無法運作，寧可用預設也不能讓頁面掛掉。
 */
export function parseCategories(raw: string | null | undefined): string[] {
  if (!raw) return [...DEFAULT_CATEGORIES];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [...DEFAULT_CATEGORIES];
  }
  if (!Array.isArray(parsed)) return [...DEFAULT_CATEGORIES];
  const cleaned = parsed
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(item => item.length > 0);
  return cleaned.length > 0 ? cleaned : [...DEFAULT_CATEGORIES];
}

export function isValidCategory(value: string, categories: readonly string[]): boolean {
  return value.length > 0 && categories.includes(value);
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx vitest run giving/categories.test.ts
```

預期：PASS

- [ ] **Step 5: Commit**

```bash
git add Church/giving/categories.ts Church/giving/categories.test.ts
git commit -m "feat(church): 奉獻用途分類模組"
```

---

## Task 3: 輸入驗證

**Files:**
- Create: `Church/giving/validation.ts`
- Test: `Church/giving/validation.test.ts`

- [ ] **Step 1: 寫失敗的測試**

建立 `Church/giving/validation.test.ts`：

```ts
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
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx vitest run giving/validation.test.ts
```

預期：FAIL，`Failed to resolve import "./validation"`

- [ ] **Step 3: 寫實作**

建立 `Church/giving/validation.ts`：

```ts
import { isValidCategory } from './categories';

/** 下限 $1.00 —— 再低手續費就比奉獻本身還高，沒有意義 */
export const MIN_AMOUNT_CENTS = 100;
/** 上限 $25,000 —— 防呆，更大額請走電匯（奉獻頁上已列電匯資訊） */
export const MAX_AMOUNT_CENTS = 2_500_000;

export const MAX_NAME_LENGTH = 100;
export const MAX_NOTE_LENGTH = 1000;
/** RFC 5321 的 forward path 上限。沒有這道上限，惡意請求可以送 100KB 的位址進 D1 與 Stripe */
export const MAX_EMAIL_LENGTH = 254;

export type GivingInput = {
  amountCents: number;
  category: string;
  donorName: string;
  donorEmail: string;
  coverFee: boolean;
  note: string;
};

export type ValidationResult =
  | { ok: true; value: GivingInput }
  | { ok: false; field: string; message: string };

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
  if (donorEmail.length > MAX_EMAIL_LENGTH) {
    return fail('donorEmail', '電子郵件過長，請確認是否輸入正確');
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
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx vitest run giving/validation.test.ts
```

預期：PASS

- [ ] **Step 5: Commit**

```bash
git add Church/giving/validation.ts Church/giving/validation.test.ts
git commit -m "feat(church): 奉獻表單輸入驗證"
```

---

## Task 4: Stripe Webhook 簽章驗證

> **測試補充（執行過程中發現）：** 下方 Step 1 的測試雖然涵蓋了錯誤金鑰、竄改 payload、`deadbeef` 等情境，但這些簽章與正確值「處處不同」，因此無法分辨「全長比對」與「只比前幾個 byte」。實測把 `timingSafeEqual` 換成只比前 8 個十六進位字元，15 條測試全數通過。務必另外加上共用前綴但後段發散、僅末字元不同、僅首字元不同、以及長度多一 / 少一的測試，把全長比對這個性質鎖住。

Stripe 的簽章與現有 `mailbox/inbound.ts` 的 Svix 驗證有兩點關鍵差異，實作時別照抄：

1. Stripe 把 `whsec_...` **整串當作 HMAC 金鑰直接使用**（UTF-8 bytes），Svix 則是去掉前綴後 base64 解碼
2. Stripe 的簽章是 **hex** 編碼，Svix 是 base64

**Files:**
- Create: `Church/giving/stripeWebhook.ts`
- Test: `Church/giving/stripeWebhook.test.ts`

- [ ] **Step 1: 寫失敗的測試**

建立 `Church/giving/stripeWebhook.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { verifyStripeSignature, parseStripeSignatureHeader } from './stripeWebhook';

const SECRET = 'whsec_testsecretvalue1234567890';

/** 依 Stripe 規則產生合法簽章，供測試使用 */
async function sign(payload: string, timestamp: number, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const hex = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `t=${timestamp},v1=${hex}`;
}

describe('parseStripeSignatureHeader', () => {
  it('解析出時間戳與所有 v1 簽章', () => {
    const parsed = parseStripeSignatureHeader('t=1700000000,v1=aaa,v1=bbb');
    expect(parsed).toEqual({ timestamp: 1700000000, signatures: ['aaa', 'bbb'] });
  });

  it('忽略未知的 scheme（如 v0）', () => {
    const parsed = parseStripeSignatureHeader('t=1700000000,v0=xxx,v1=aaa');
    expect(parsed).toEqual({ timestamp: 1700000000, signatures: ['aaa'] });
  });

  it('缺時間戳回 null', () => {
    expect(parseStripeSignatureHeader('v1=aaa')).toBeNull();
  });

  it('缺簽章回 null', () => {
    expect(parseStripeSignatureHeader('t=1700000000')).toBeNull();
  });

  it('空字串回 null', () => {
    expect(parseStripeSignatureHeader('')).toBeNull();
  });
});

describe('verifyStripeSignature', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' });
  const now = 1700000000;

  it('正確的簽章通過', async () => {
    const header = await sign(payload, now);
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now })).toBe(true);
  });

  it('被竄改的 payload 不通過', async () => {
    const header = await sign(payload, now);
    const tampered = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', extra: 1 });
    expect(await verifyStripeSignature({ payload: tampered, header, secret: SECRET, nowSec: now })).toBe(false);
  });

  it('用錯誤金鑰簽的不通過', async () => {
    const header = await sign(payload, now, 'whsec_wrongsecret');
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now })).toBe(false);
  });

  it('過期的時間戳不通過（超過 300 秒容忍度）', async () => {
    const header = await sign(payload, now);
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now + 301 })).toBe(false);
  });

  it('容忍度內的時間戳通過', async () => {
    const header = await sign(payload, now);
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now + 299 })).toBe(true);
  });

  it('未來時間戳超過容忍度也不通過', async () => {
    const header = await sign(payload, now);
    expect(await verifyStripeSignature({ payload, header, secret: SECRET, nowSec: now - 301 })).toBe(false);
  });

  it('缺少簽章標頭不通過', async () => {
    expect(await verifyStripeSignature({ payload, header: null, secret: SECRET, nowSec: now })).toBe(false);
  });

  it('格式錯誤的標頭不通過', async () => {
    expect(await verifyStripeSignature({ payload, header: 'garbage', secret: SECRET, nowSec: now })).toBe(false);
  });

  it('空的 secret 不通過（設定漏了不能變成全部放行）', async () => {
    const header = await sign(payload, now);
    expect(await verifyStripeSignature({ payload, header, secret: '', nowSec: now })).toBe(false);
  });

  it('多個 v1 簽章中有一個正確即通過（Stripe 輪換金鑰時會這樣送）', async () => {
    const header = await sign(payload, now);
    const hex = header.split('v1=')[1];
    const multi = `t=${now},v1=deadbeef,v1=${hex}`;
    expect(await verifyStripeSignature({ payload, header: multi, secret: SECRET, nowSec: now })).toBe(true);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx vitest run giving/stripeWebhook.test.ts
```

預期：FAIL，`Failed to resolve import "./stripeWebhook"`

- [ ] **Step 3: 寫實作**

建立 `Church/giving/stripeWebhook.ts`：

```ts
/**
 * Stripe webhook 簽章驗證。
 *
 * 與 mailbox/inbound.ts 的 Svix 驗證不同，不要照抄：
 *   - Stripe 把整串 whsec_... 當 HMAC 金鑰直接用（UTF-8），Svix 是去前綴後 base64 解碼
 *   - Stripe 簽章是 hex，Svix 是 base64
 *
 * 簽章內容為 `${timestamp}.${rawBody}`，其中 rawBody 必須是**未經解析的原始字串**。
 * 先 JSON.parse 再 stringify 會改變位元組，簽章就對不上了。
 */

export type StripeSignatureParts = {
  timestamp: number;
  signatures: string[];
};

/**
 * 型別要寫 `string | null`：呼叫端拿到的是 `request.headers.get(...)`，本來就可能是 null。
 * 專案沒開 strict，宣告成 `string` 也編得過，但型別就騙人了 —— 日後若有人單獨拿
 * 這個函式來用（繞過 verifyStripeSignature 的守衛），會照著錯的型別假設寫。
 */
export function parseStripeSignatureHeader(header: string | null): StripeSignatureParts | null {
  if (!header) return null;
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const scheme = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (scheme === 't') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (scheme === 'v1') {
      signatures.push(value);
    }
  }

  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

/** 定時比較，避免以回應時間推測正確簽章。 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export type VerifyParams = {
  /** 未經解析的原始請求 body */
  payload: string;
  /** Stripe-Signature 標頭 */
  header: string | null;
  /** whsec_ 開頭的 webhook 簽章密鑰 */
  secret: string;
  nowSec?: number;
  toleranceSec?: number;
};

export async function verifyStripeSignature(p: VerifyParams): Promise<boolean> {
  if (!p.secret || !p.header) return false;

  const parsed = parseStripeSignatureHeader(p.header);
  if (!parsed) return false;

  const now = p.nowSec ?? Math.floor(Date.now() / 1000);
  const tolerance = p.toleranceSec ?? 300;
  if (Math.abs(now - parsed.timestamp) > tolerance) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(p.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${parsed.timestamp}.${p.payload}`),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return parsed.signatures.some(sig => timingSafeEqual(sig.toLowerCase(), expected));
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx vitest run giving/stripeWebhook.test.ts
```

預期：PASS

- [ ] **Step 5: Commit**

```bash
git add Church/giving/stripeWebhook.ts Church/giving/stripeWebhook.test.ts
git commit -m "feat(church): Stripe webhook 簽章驗證"
```

---

## Task 5: 速率限制

**Files:**
- Create: `Church/giving/rateLimit.ts`
- Test: `Church/giving/rateLimit.test.ts`

- [ ] **Step 1: 寫失敗的測試**

建立 `Church/giving/rateLimit.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { evaluateRateLimit, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from './rateLimit';

const T0 = new Date('2026-09-23T10:00:00.000Z').getTime();

describe('evaluateRateLimit', () => {
  it('沒有既有記錄時放行，並開新視窗', () => {
    const result = evaluateRateLimit(null, T0);
    expect(result).toEqual({ allowed: true, nextWindowStartMs: T0, nextCount: 1 });
  });

  it('視窗內未達上限時放行並累加', () => {
    const result = evaluateRateLimit({ windowStartMs: T0, count: 2 }, T0 + 1000);
    expect(result).toEqual({ allowed: true, nextWindowStartMs: T0, nextCount: 3 });
  });

  it('視窗內達到上限時擋下', () => {
    const result = evaluateRateLimit({ windowStartMs: T0, count: RATE_LIMIT_MAX }, T0 + 1000);
    expect(result.allowed).toBe(false);
  });

  it('擋下時不累加計數（避免持續打擊讓視窗永不重置）', () => {
    const result = evaluateRateLimit({ windowStartMs: T0, count: RATE_LIMIT_MAX }, T0 + 1000);
    expect(result.nextCount).toBe(RATE_LIMIT_MAX);
    expect(result.nextWindowStartMs).toBe(T0);
  });

  it('視窗過期後重置', () => {
    const result = evaluateRateLimit(
      { windowStartMs: T0, count: RATE_LIMIT_MAX },
      T0 + RATE_LIMIT_WINDOW_MS + 1,
    );
    expect(result).toEqual({ allowed: true, nextWindowStartMs: T0 + RATE_LIMIT_WINDOW_MS + 1, nextCount: 1 });
  });

  it('恰好在視窗邊界上仍屬同一視窗', () => {
    const result = evaluateRateLimit({ windowStartMs: T0, count: RATE_LIMIT_MAX }, T0 + RATE_LIMIT_WINDOW_MS);
    expect(result.allowed).toBe(false);
  });

  it('上限為每分鐘 15 次', () => {
    expect(RATE_LIMIT_MAX).toBe(15);
    expect(RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx vitest run giving/rateLimit.test.ts
```

預期：FAIL，`Failed to resolve import "./rateLimit"`

- [ ] **Step 3: 寫實作**

建立 `Church/giving/rateLimit.ts`：

```ts
/**
 * 建立 PaymentIntent 的速率限制。
 *
 * 目的不是擋 DDoS，而是避免奉獻端點被拿來當卡號測試工具（carding）——
 * 攻擊者用大量被竊卡號逐一嘗試小額付款來篩出可用的卡。
 * Stripe Radar 會擋一部分，但不該讓教會的端點成為第一道免費關卡。
 */

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
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx vitest run giving/rateLimit.test.ts
```

預期：PASS

- [ ] **Step 5: Commit**

```bash
git add Church/giving/rateLimit.ts Church/giving/rateLimit.test.ts
git commit -m "feat(church): 奉獻端點速率限制邏輯"
```

---

## Task 6: 資料庫 Migration

**Files:**
- Create: `Church/migrations/0018_donations_stripe.sql`（編號依實際情況調整，見 Step 1）

- [ ] **Step 1: 確認下一個 migration 編號**

```bash
ls Church/migrations/
```

找出目前最大的編號，新檔名用「最大號 + 1」。實際確認過目前最大是 `0017`，因此新檔為 `0018`。

- [ ] **Step 2: 寫 migration**

建立 `Church/migrations/0018_donations_stripe.sql`：

```sql
-- 重建 donations 表以支援 Stripe 線上奉獻。
--
-- 舊表有兩個擋路的問題：
--   1. status CHECK (status IN ('completed')) —— 只允許單一值，放不下 pending/failed/refunded
--   2. amount REAL —— 金額用浮點數，累加會有誤差，報稅金額不能這樣存
-- SQLite 無法 ALTER TABLE 移除 CHECK，只能重建。

-- 刻意不用 PRAGMA foreign_keys = OFF/ON 包住。實測過：D1 的 batch 一定在交易內，
-- 而 SQLite 的這個 pragma 在交易開啟後是 no-op —— 寫了看起來像防護，其實毫無作用，
-- 反而會誤導日後重建「真的有外鍵指向它」的表的人。本表目前無任何外鍵指向。

CREATE TABLE donations_new (
  id                        TEXT PRIMARY KEY,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,

  donor_name                TEXT,
  donor_email               TEXT,
  category                  TEXT,
  note                      TEXT,

  amount_cents              INTEGER NOT NULL,
  covered_fee_cents         INTEGER NOT NULL DEFAULT 0,
  gross_cents               INTEGER NOT NULL,
  currency                  TEXT NOT NULL DEFAULT 'usd',

  -- type 與 source 刻意不給預設值。它們是財務記錄的分類欄位，
  -- 漏填應該直接寫入失敗，而不是被悄悄標成 one-time / stripe。
  type                      TEXT NOT NULL CHECK (type IN ('one-time', 'recurring')),
  status                    TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  source                    TEXT NOT NULL CHECK (source IN ('stripe', 'legacy', 'manual')),

  stripe_payment_intent_id  TEXT UNIQUE,
  receipt_url               TEXT,
  failure_message           TEXT
);

-- 搬舊資料。舊表金額為「元」的 REAL，轉為「分」的整數。
-- 舊資料沒有姓名/email/用途，留 NULL；source 標 legacy 以與 Stripe 記錄區分。
INSERT INTO donations_new (
  id, created_at, updated_at,
  donor_name, donor_email, category, note,
  amount_cents, covered_fee_cents, gross_cents, currency,
  type, status, source,
  stripe_payment_intent_id, receipt_url, failure_message
)
SELECT
  id, date, date,
  NULL, NULL, NULL, NULL,
  CAST(ROUND(amount * 100) AS INTEGER), 0, CAST(ROUND(amount * 100) AS INTEGER), 'usd',
  type, status, 'legacy',
  NULL, NULL, NULL
FROM donations;

-- 保留舊表而不是 DROP。
--
-- 這是教會的奉獻帳，而且 dev 與 prod 共用同一個 D1 —— 沒有排練環境，
-- Task 24 那一次執行就是正式資料。CAST(ROUND(amount * 100)) 對所有合法的
-- 兩位小數金額都精確，但對第三位小數剛好是半分的值會少 1 分，而舊的寫入端
-- 從未驗證過小數位數。原始值一旦沒了，日後有人對某筆報稅金額有疑問時，
-- 沒有任何東西可以回頭稽核；總額比對也擋不住兩筆反向誤差互相抵銷。
--
-- 舊表沒有任何程式會查，資料量也極小。等教會對過一個完整的報稅週期、
-- 確認無誤之後，再用另一個 migration 把它刪掉。
ALTER TABLE donations RENAME TO donations_pre_0018;
ALTER TABLE donations_new RENAME TO donations;

CREATE INDEX IF NOT EXISTS idx_donations_created ON donations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_donations_status  ON donations(status);
CREATE INDEX IF NOT EXISTS idx_donations_email   ON donations(donor_email);

-- 速率限制用的小表。以 IP 為 key，記錄視窗起點與計數。
CREATE TABLE IF NOT EXISTS giving_rate_limit (
  ip                TEXT PRIMARY KEY,
  window_start_ms   INTEGER NOT NULL,
  count             INTEGER NOT NULL
);
```

- [ ] **Step 3: 在本地資料庫套用並驗證**

> **順序警告：** 若要驗證舊資料的金額轉換（Step 5），**必須先塞測資再套用**。一旦套用，舊的 `date` / `amount` 欄位就不存在了，照舊 schema 寫入只會直接報錯。正確順序是：塞測資 → 套用 → 驗證 → 清除測資。

```bash
npx wrangler d1 migrations apply bol-church --local
```

預期：顯示 `0018_donations_stripe.sql` 套用成功

- [ ] **Step 4: 驗證新結構正確**

```bash
npx wrangler d1 execute bol-church --local --command "SELECT name FROM pragma_table_info('donations');"
```

預期輸出包含 `amount_cents`、`covered_fee_cents`、`gross_cents`、`stripe_payment_intent_id`、`donor_email`、`source`

```bash
npx wrangler d1 execute bol-church --local --command "SELECT COUNT(*) AS n FROM giving_rate_limit;"
```

預期：回傳 `n = 0`（表已建立）

- [ ] **Step 5: 驗證舊資料的金額轉換正確**

舊表的 `amount` 是「元」的浮點數，新表是「分」的整數。搬遷寫錯會讓歷史奉獻金額差 100 倍，而且事後很難發現。

```bash
npx wrangler d1 execute bol-church --local --command "SELECT id, amount_cents, gross_cents, source, status FROM donations WHERE source = 'legacy' ORDER BY created_at DESC LIMIT 10;"
```

預期：每筆的 `amount_cents` 都是舊金額 × 100 的整數（例如舊資料 `50` → `5000`），且 `amount_cents = gross_cents`、`source = legacy`

```bash
npx wrangler d1 execute bol-church --local --command "SELECT COUNT(*) AS bad FROM donations WHERE amount_cents + covered_fee_cents != gross_cents;"
```

預期：`bad = 0`（恆等式在所有列都成立）

> **本地 `donations` 表確認是空的**，所以上面兩個查詢照跑只會回空結果 —— 那等於什麼都沒驗到。搬遷邏輯寫錯會讓歷史奉獻金額差 100 倍，這是最不該只靠「看起來沒報錯」就放過的地方。
>
> 因此**必須先塞測試資料再驗**。在套用 migration 之前，先用舊 schema 寫入幾筆涵蓋代表性金額與進位邊界的資料：
>
> ```bash
> npx wrangler d1 execute bol-church --local --command "INSERT INTO donations (id, date, amount, type, status) VALUES ('mig-t1','2025-01-05T00:00:00.000Z',50,'one-time','completed'),('mig-t2','2025-02-05T00:00:00.000Z',100.5,'one-time','completed'),('mig-t3','2025-03-05T00:00:00.000Z',0.01,'recurring','completed'),('mig-t4','2025-04-05T00:00:00.000Z',1234.56,'one-time','completed'),('mig-t5','2025-05-05T00:00:00.000Z',0.1,'one-time','completed');"
> ```
>
> 套用 migration 後，這五筆應分別成為 `5000`、`10050`、`1`、`123456`、`10` 分。`0.1` 與 `100.5` 特別重要 —— 它們是浮點數無法精確表示的值，正是 `CAST(ROUND(amount * 100) AS INTEGER)` 可能出錯的地方。
>
> 驗完把測試資料清掉：
>
> ```bash
> npx wrangler d1 execute bol-church --local --command "DELETE FROM donations WHERE id LIKE 'mig-t%';"
> ```
>
> 正式環境套用前（Task 24 Step 5）要再跑一次同樣的金額檢查，但**不可**在正式環境塞測試資料。

- [ ] **Step 6: Commit**

```bash
git add Church/migrations/0018_donations_stripe.sql
git commit -m "feat(church): 重建 donations 表以支援 Stripe（整數分 + 完整狀態）"
```

---

## Task 7: 環境設定與型別

**Files:**
- Modify: `Church/server.ts`（`Env` type、`DonationRow`、`mapDonation`）
- Modify: `Church/wrangler.toml`
- Modify: `Church/wrangler.example.toml`
- Modify: `Church/data.ts`

- [ ] **Step 1: 在 Env 型別加 Stripe 設定**

在 `Church/server.ts` 的 `Env` type 中，`RESEND_WEBHOOK_SECRET` 那幾行之後加入：

```ts
  /** Stripe 秘密金鑰（sk_ 開頭）；務必用 wrangler secret put 設定，不可寫入檔案 */
  STRIPE_SECRET_KEY?: string;
  /** Stripe webhook 簽章密鑰（whsec_ 開頭）；未設則 webhook 端點一律拒收 */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Stripe 可公開金鑰（pk_ 開頭）；設計上即為公開值，會編進前端 */
  STRIPE_PUBLISHABLE_KEY?: string;
  /** 手續費百分比，如 "2.2"；未設則用非營利預設 2.2% */
  STRIPE_FEE_PERCENT?: string;
  /** 手續費固定額（分），如 "30"；未設則用預設 30 */
  STRIPE_FEE_FIXED_CENTS?: string;
```

- [ ] **Step 2: 在 wrangler.toml 加公開設定**

在 `Church/wrangler.toml` 的 `[vars]` 區塊末尾（`MAILBOX_INBOUND_DOMAIN` 那行之後）加入：

```toml

# Stripe 線上奉獻。
# STRIPE_SECRET_KEY 與 STRIPE_WEBHOOK_SECRET 請用 `wrangler secret put` 設定，勿寫入此檔。
# Publishable key 設計上即為公開值，會編進前端 bundle。
STRIPE_PUBLISHABLE_KEY = "pk_test_REPLACE_WITH_TEST_KEY_BEFORE_DEV"
# Stripe 美國非營利費率 2.2% + $0.30；若後台核准的費率不同請改這裡。
STRIPE_FEE_PERCENT = "2.2"
STRIPE_FEE_FIXED_CENTS = "30"
```

> **`wrangler.toml` 不會進版控。** 它列在 `Church/.gitignore`，因為裡面有這個 repo 的真實帳號 ID。
> 所以 Step 2 的改動只存在於本機磁碟，Step 8 的 `git add` 清單也不包含它 —— 進版控的是
> `wrangler.example.toml` 這份範本。這代表 `STRIPE_FEE_PERCENT` 等設定值在每台開發機、
> 每次重新 clone 之後都要重新填一次，請照範本補齊。
>
> **上線前必改：** `STRIPE_PUBLISHABLE_KEY` 在開發期間填 test key，正式部署前換成
> `pk_live_51UIxtnRrRVwtjfXrP2Wqd4und9tHI3chBN0rOCeMbUPQD2QutwIGxxasPnB2biBMdqeL6bqp20qHO2TOBvfseEXZ00stO4tKmu`

- [ ] **Step 3: 同步 wrangler.example.toml**

在 `Church/wrangler.example.toml` 的 `[vars]` 區塊加入同樣三行，但值一律用佔位字串：

```toml

# Stripe 線上奉獻。secret key 與 webhook secret 請用 `wrangler secret put` 設定。
STRIPE_PUBLISHABLE_KEY = "pk_test_xxx"
STRIPE_FEE_PERCENT = "2.2"
STRIPE_FEE_FIXED_CENTS = "30"
```

- [ ] **Step 4: 更新 Donation 型別**

把 `Church/data.ts` 中的 `Donation` interface 整段替換為：

```ts
export type DonationStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface Donation {
  id: string;
  createdAt: string;
  updatedAt: string;
  donorName: string | null;
  donorEmail: string | null;
  category: string | null;
  note: string | null;
  /** 奉獻本金（分） */
  amountCents: number;
  /** 奉獻者自願加付的手續費（分） */
  coveredFeeCents: number;
  /** 實際刷卡總額（分） */
  grossCents: number;
  currency: string;
  type: 'one-time' | 'recurring';
  status: DonationStatus;
  source: 'stripe' | 'legacy' | 'manual';
  receiptUrl: string | null;
  failureMessage: string | null;
}
```

- [ ] **Step 5: 更新 DonationRow 與 mapDonation**

在 `Church/server.ts` 找到 `type DonationRow = {` 整段（約在第 471 行），替換為：

```ts
type DonationRow = {
  id: string;
  created_at: string;
  updated_at: string;
  donor_name: string | null;
  donor_email: string | null;
  category: string | null;
  note: string | null;
  amount_cents: number;
  covered_fee_cents: number;
  gross_cents: number;
  currency: string;
  type: string;
  status: string;
  source: string;
  stripe_payment_intent_id: string | null;
  receipt_url: string | null;
  failure_message: string | null;
};
```

找到 `function mapDonation(row: DonationRow)` 整個函式（約在第 868 行），替換為：

```ts
/**
 * 轉為前端型別。注意 stripe_payment_intent_id 刻意不外送 ——
 * 它沒有前端用途，少一個外洩面。
 */
function mapDonation(row: DonationRow) {
  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    donorName: row.donor_name,
    donorEmail: row.donor_email,
    category: row.category,
    note: row.note,
    amountCents: row.amount_cents,
    coveredFeeCents: row.covered_fee_cents,
    grossCents: row.gross_cents,
    currency: row.currency,
    type: row.type as 'one-time' | 'recurring',
    status: row.status as 'pending' | 'completed' | 'failed' | 'refunded',
    source: row.source as 'stripe' | 'legacy' | 'manual',
    receiptUrl: row.receipt_url,
    failureMessage: row.failure_message,
  };
}
```

- [ ] **Step 6: 更新 handleBootstrap 的 donations 查詢**

在 `Church/server.ts` 的 `handleBootstrap` 中找到：

```ts
      env.DB.prepare('SELECT * FROM donations ORDER BY date DESC').all<DonationRow>(),
```

替換為（奉獻資料含個資，收斂為僅 owner 可讀）：

```ts
      currentUser.role === 'owner'
        ? env.DB.prepare('SELECT * FROM donations ORDER BY created_at DESC LIMIT 500').all<DonationRow>()
        : Promise.resolve({ results: [] as DonationRow[] }),
```

- [ ] **Step 7: 型別檢查**

```bash
npm run typecheck
```

預期：此時 `submitDonation` 相關處會報錯（Task 8 移除），其餘 donations 相關錯誤應已消失。先記下錯誤清單，不要在此步修正。

- [ ] **Step 8: Commit**

```bash
git add Church/server.ts Church/wrangler.example.toml Church/data.ts
git commit -m "feat(church): 奉獻資料型別與 Stripe 環境設定"
```

---

## Task 8: 拆除假奉獻表單（止血）

正式站上那個假表單會讓奉獻者以為自己已經完成奉獻，這個 Task 的唯一目的就是讓它停止誤導人。因此它必須把**前端到後端整條路徑**一起拆掉 —— 只拔後端而讓頁面繼續顯示表單，等於沒止到血。

這個 Task 結束時 `npm run typecheck` 必須完全乾淨。`submitDonation` 一旦移除，`GivingPage.tsx` 與 `AdminDashboard.tsx` 就會編不過，所以它們的最小修正屬於本 Task，不能推到 Task 21／22 —— 否則中間十幾個 commit 都是壞的。Task 21 會用真正的 Stripe 表單取代這裡的過渡畫面，Task 22 會把後台列表做完整；本 Task 只做讓樹保持綠色所需的最小改動。

**Files:**
- Modify: `Church/server.ts`
- Modify: `Church/api.ts`
- Modify: `Church/context/AdminContext.tsx`
- Modify: `Church/components/GivingPage.tsx`
- Modify: `Church/components/AdminDashboard.tsx`
- Delete: `Church/components/Giving.tsx`

- [ ] **Step 1: 移除假路由**

在 `Church/server.ts` 刪除整段 `POST /api/donations` handler。它以 `if (url.pathname === '/api/donations' && request.method === 'POST') {` 開頭，內容是產生一個 UUID、寫一筆 `status: 'completed'` 進 `donations`、回傳 `mapDonation(row as DonationRow)`。整個 `if` 區塊刪除。

- [ ] **Step 2: 移除 api.ts 的 submitDonation**

在 `Church/api.ts` 刪除這兩行：

```ts
  submitDonation: (payload: Omit<Donation, 'id' | 'date' | 'status'>) =>
    request<Donation>('/api/donations', { method: 'POST', body: JSON.stringify(payload) }),
```

- [ ] **Step 3: 移除 AdminContext 的 submitDonation**

在 `Church/context/AdminContext.tsx` 刪除三處：介面宣告中的 `submitDonation: (data: Omit<Donation, 'id' | 'date' | 'status'>) => Promise<void>;`、函式定義本體、以及 provider value 中的 `submitDonation,`。

- [ ] **Step 4: 從奉獻頁拆掉假表單**

在 `Church/components/GivingPage.tsx` 刪除整個 `GivingForm` 元件（從註解 `// This is the form from Giving.tsx` 到該元件結束），並把 `useAdmin`、`LockIcon`、`churchAlert` 的 import 一併移除（它們只被這個元件用到）。

新增一個過渡元件，放在同一個檔案裡 —— Task 21 會把它換成真正的 Stripe 表單：

```tsx
/**
 * 線上刷卡奉獻的過渡畫面。Task 21 會換成真正的 Stripe 表單。
 *
 * 在那之前寧可誠實說「還沒好」，也不要留一個按了會顯示「感謝奉獻」
 * 卻根本沒收到錢的假表單 —— 那比沒有功能糟糕得多。
 */
const OnlineGivingComingSoon: React.FC = () => {
  const { t } = useLocalization();
  return (
    <div className="mx-auto mt-8 max-w-lg rounded-xl bg-white p-8 text-center shadow-lg">
      <p className="mb-6 text-gray-700">{t('giving.onlineComingSoon')}</p>
      <a
        href="/giving/other-ways-to-give"
        onClick={event => { event.preventDefault(); navigateToRoute('/giving/other-ways-to-give'); }}
        className="inline-block rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
      >
        {t('givingPage.navOtherWaysToGive')}
      </a>
      <div className="mt-6 space-y-1 text-sm">
        <p><a href="tel:4258987650" className="font-semibold text-blue-700 hover:text-blue-800">(425) 898-7650</a></p>
        <p><a href="mailto:bolccop@gmail.com" className="font-semibold text-blue-700 hover:text-blue-800">bolccop@gmail.com</a></p>
      </div>
    </div>
  );
};
```

把檔案末尾的 `{activeTab === 'ways-to-give' && <GivingForm />}` 改為 `{activeTab === 'ways-to-give' && <OnlineGivingComingSoon />}`。

- [ ] **Step 5: 加上過渡文案**

在 `Church/constants/translations.ts` 的 `giving` 區塊加入：

```ts
    onlineComingSoon: { en: 'Online card giving is coming soon. In the meantime you can give by Zelle, PayPal, check, or bank transfer, or contact the church office.', zh: '線上刷卡奉獻即將推出。在此之前，您可以透過 Zelle、PayPal、支票或匯款奉獻，也歡迎直接與教會辦公室聯絡。' },
```

- [ ] **Step 6: 修正後台三處欄位引用**

`AdminDashboard.tsx` 仍在讀舊 schema 的欄位。做**最小**修正讓它編得過即可，完整改版是 Task 22。

第 261 行附近：

```tsx
  const totalGiven = donations.reduce((sum, donation) => sum + donation.amount, 0);
```

改為（順帶修掉一個真的錯誤：失敗與退款的奉獻不該計入總額）：

```tsx
  const totalGivenCents = donations
    .filter(donation => donation.status === 'completed')
    .reduce((sum, donation) => sum + donation.grossCents, 0);
```

兩處顯示 `${totalGiven.toLocaleString()}` 改為 `${(totalGivenCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`。

表格列中：

```tsx
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(donation.date, dateLocale)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">${donation.amount}</td>
```

改為：

```tsx
                    <td className="px-6 py-4 text-sm text-gray-600">{formatDate(donation.createdAt, dateLocale)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-900">${(donation.grossCents / 100).toFixed(2)}</td>
```

- [ ] **Step 7: 刪除已無用途的 Giving.tsx**

先確認沒有其他地方 import 它：

```bash
grep -rn "from './Giving'" Church --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v GivingPage
```

預期：無輸出。

```bash
git rm Church/components/Giving.tsx
```

- [ ] **Step 8: 型別檢查必須完全乾淨**

```bash
npm run typecheck
```

預期：**PASS，零錯誤**。這是本 Task 的驗收條件之一 —— 若還有錯誤，代表上面某一步沒做完，不可帶著錯誤進 Task 9。

```bash
npm run test
```

預期：38 files / 453 tests 全綠。

- [ ] **Step 9: 在瀏覽器確認假表單真的不見了**

```bash
npm run dev
```

開 http://localhost:5173/giving/ways-to-give ，確認看到的是「即將推出」與其他奉獻方式的連結，**沒有任何金額輸入框或奉獻按鈕**。這是本 Task 的重點，用眼睛確認過再往下走。

- [ ] **Step 10: Commit**

```bash
git add Church/server.ts Church/api.ts Church/context/AdminContext.tsx Church/components/GivingPage.tsx Church/components/AdminDashboard.tsx Church/constants/translations.ts
git commit -m "fix(church): 拆除會誤導奉獻者的假奉獻表單"
```

---

## Task 9: Stripe API 客戶端

不引入 Stripe Node SDK —— 它在 Workers 環境需要額外的 fetch http client 設定，而我們只需要一個端點。直接呼叫 REST API，與現有呼叫 Resend 的做法一致。

**Files:**
- Create: `Church/giving/stripeApi.ts`

- [ ] **Step 1: 寫實作**

建立 `Church/giving/stripeApi.ts`：

```ts
/**
 * Stripe REST API 客戶端（只用得到的部分）。
 *
 * 直接用 fetch 而非 Node SDK：SDK 在 Workers 需要額外的 http client 設定，
 * 而我們只需要一個端點。與 server.ts 呼叫 Resend 的做法一致。
 */

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

/** Stripe 只吃 application/x-www-form-urlencoded，巢狀結構用 a[b] 表示。 */
function toFormBody(data: Record<string, string | number | boolean | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    params.append(key, String(value));
  }
  return params.toString();
}

export type CreatePaymentIntentParams = {
  /** 實際扣款金額（分） */
  grossCents: number;
  currency: string;
  receiptEmail: string;
  /** 用來讓同一次送出重試時不會產生兩筆 PaymentIntent */
  idempotencyKey: string;
  metadata: Record<string, string>;
};

/**
 * 注意那幾個 `?: undefined` 欄位不是贅字，拿掉會編不過。
 *
 * 本專案的 tsconfig 沒有開 `strict`（因此 `strictNullChecks` 為 false），
 * 在這個設定下 TypeScript 不會用 `if (!r.ok)` 這類真假值判斷把可辨識聯合
 * 收斂到某一分支 —— `intent.error` 會報 TS2339。加上共用的 optional
 * 欄位後，兩個分支都有這些屬性，收斂失敗也能編譯。純型別層，執行期毫無差異。
 * Task 3 的 ValidationResult 出於同樣原因也是這樣寫的。
 */
export type CreatePaymentIntentResult =
  | { ok: true; id: string; clientSecret: string; error?: undefined }
  | { ok: false; error: string; id?: undefined; clientSecret?: undefined };

export async function createPaymentIntent(
  secretKey: string,
  params: CreatePaymentIntentParams,
): Promise<CreatePaymentIntentResult> {
  const body: Record<string, string | number | boolean> = {
    amount: params.grossCents,
    currency: params.currency,
    receipt_email: params.receiptEmail,
    // 讓 Stripe 後台決定啟用哪些付款方式（卡片、Apple Pay、Google Pay…），
    // 不必在程式碼裡逐一列舉
    'automatic_payment_methods[enabled]': true,
  };
  for (const [key, value] of Object.entries(params.metadata)) {
    body[`metadata[${key}]`] = value;
  }

  try {
    const response = await fetch(`${STRIPE_API_BASE}/payment_intents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': params.idempotencyKey,
      },
      body: toFormBody(body),
    });

    const payload = await response.json<{
      id?: string;
      client_secret?: string;
      error?: { message?: string };
    }>();

    if (!response.ok || !payload.id || !payload.client_secret) {
      return { ok: false, error: payload.error?.message || `Stripe HTTP ${response.status}` };
    }
    return { ok: true, id: payload.id, clientSecret: payload.client_secret };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
```

- [ ] **Step 2: 型別檢查**

```bash
npm run typecheck
```

預期：PASS

- [ ] **Step 3: Commit**

```bash
git add Church/giving/stripeApi.ts
git commit -m "feat(church): Stripe REST API 客戶端"
```

---

## Task 10: `GET /api/giving/config` 路由

**Files:**
- Modify: `Church/server.ts`

- [ ] **Step 1: 加 import**

在 `Church/server.ts` 的 import 區塊末尾（`snapshot/snapshot` 那段之後）加入：

```ts
import { computeGiving, parseFeeConfig } from './giving/fee';
import { parseCategories, CATEGORIES_SETTING_KEY } from './giving/categories';
import { validateGivingInput } from './giving/validation';
import { verifyStripeSignature } from './giving/stripeWebhook';
import { evaluateRateLimit } from './giving/rateLimit';
import { createPaymentIntent } from './giving/stripeApi';
```

- [ ] **Step 2: 加輔助函式**

在 `Church/server.ts` 的 `mapDonation` 函式之後加入：

```ts
// ============================================================================
// 線上奉獻（Stripe）
// ============================================================================

async function getGivingCategories(env: Env): Promise<string[]> {
  const row = await env.DB
    .prepare('SELECT value_json FROM settings WHERE key = ?')
    .bind(CATEGORIES_SETTING_KEY)
    .first<{ value_json: string }>();
  return parseCategories(row?.value_json ?? null);
}

function givingFeeConfig(env: Env) {
  return parseFeeConfig({ percent: env.STRIPE_FEE_PERCENT, fixedCents: env.STRIPE_FEE_FIXED_CENTS });
}

async function handleGivingConfig(env: Env): Promise<Response> {
  const categories = await getGivingCategories(env);
  const fee = givingFeeConfig(env);
  return json({
    publishableKey: env.STRIPE_PUBLISHABLE_KEY ?? '',
    enabled: Boolean(env.STRIPE_PUBLISHABLE_KEY && env.STRIPE_SECRET_KEY),
    categories,
    currency: 'usd',
    feePercent: fee.percentBp / 100,
    feeFixedCents: fee.fixedCents,
  });
}
```

- [ ] **Step 3: 掛上路由**

在 `Church/server.ts` 原本 `POST /api/donations` 所在位置（已於 Task 8 刪除）加入：

```ts
    if (url.pathname === '/api/giving/config' && request.method === 'GET') {
      return handleGivingConfig(env);
    }
```

- [ ] **Step 4: 本地啟動驗證**

```bash
npm run build && npx wrangler dev --port 8787
```

另開一個終端機：

```bash
curl -s http://127.0.0.1:8787/api/giving/config
```

預期輸出含 `"categories":["什一","感恩","建堂","宣教","愛心"]`、`"feePercent":2.2`、`"feeFixedCents":30`

驗證完按 Ctrl+C 停掉 `wrangler dev`。

- [ ] **Step 5: Commit**

```bash
git add Church/server.ts
git commit -m "feat(church): 奉獻設定端點 GET /api/giving/config"
```

---

## Task 11: `POST /api/giving/intent` 路由

**Files:**
- Modify: `Church/server.ts`

- [ ] **Step 1: 寫 handler**

在 `Church/server.ts` 的 `handleGivingConfig` 之後加入：

```ts
/** 取得請求來源 IP。Cloudflare 一定會帶 CF-Connecting-IP。 */
function clientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

/** 速率限制。回傳 true 表示應該擋下這次請求。 */
async function givingRateLimited(env: Env, ip: string): Promise<boolean> {
  const now = Date.now();
  const row = await env.DB
    .prepare('SELECT window_start_ms, count FROM giving_rate_limit WHERE ip = ?')
    .bind(ip)
    .first<{ window_start_ms: number; count: number }>();

  const decision = evaluateRateLimit(
    row ? { windowStartMs: row.window_start_ms, count: row.count } : null,
    now,
  );

  // 這裡是 read-then-write，兩個併發請求可能讀到同一個 count 各自 +1，漏算一次。
  // 考慮過改成單一 atomic upsert（count = count + 1）來消除競態，但視窗過期與
  // 時鐘倒退的判斷得跟著搬進 SQL 的 CASE，等於把 Task 5 的演算法與常數複製第二份。
  // 漏算的代價是每個視窗多放行一兩次，跟固定視窗本來就允許的跨界突發同一個量級；
  // 為了這個去複製演算法並不划算。維持純函式在 TS、儲存在 SQL 的分工。
  //
  // 被擋下時 decision 內容與 row 完全相同，寫回去是個無效寫入。
  // 而被擋的正是連發請求，不跳過的話最吵的流量反而製造最多 D1 寫入。
  // 參見 docs/superpowers/plans/2026-09-22-d1-usage-minimization-phase1.md
  if (decision.allowed) {
    await env.DB
      .prepare(
        `INSERT INTO giving_rate_limit (ip, window_start_ms, count) VALUES (?, ?, ?)
         ON CONFLICT(ip) DO UPDATE SET window_start_ms = excluded.window_start_ms, count = excluded.count`,
      )
      .bind(ip, decision.nextWindowStartMs, decision.nextCount)
      .run();
  }

  return !decision.allowed;
}

async function handleGivingIntent(request: Request, env: Env): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: '線上奉獻尚未啟用，請改用其他奉獻方式或與教會聯絡' }, 503);
  }

  if (await givingRateLimited(env, clientIp(request))) {
    return json({ error: '嘗試次數過多，請稍候再試' }, 429);
  }

  const payload = await readJson<unknown>(request).catch(() => null);
  const categories = await getGivingCategories(env);
  const validated = validateGivingInput(payload, categories);
  if (!validated.ok) {
    return json({ error: validated.message, field: validated.field }, 400);
  }

  const input = validated.value;
  // 金額與手續費一律由伺服器算。前端送來的任何總額欄位都不看 ——
  // 否則有人可以改 request 用 $1 換一張 $500 的報稅收據。
  const amounts = computeGiving(input.amountCents, input.coverFee, givingFeeConfig(env));

  const donationId = crypto.randomUUID();
  const intent = await createPaymentIntent(env.STRIPE_SECRET_KEY, {
    grossCents: amounts.grossCents,
    currency: 'usd',
    receiptEmail: input.donorEmail,
    idempotencyKey: donationId,
    metadata: {
      donation_id: donationId,
      category: input.category,
      donor_name: input.donorName,
      amount_cents: String(amounts.amountCents),
      covered_fee_cents: String(amounts.coveredFeeCents),
    },
  });

  if (!intent.ok) {
    console.error('Stripe createPaymentIntent failed', intent.error);
    return json({ error: '無法建立付款，請稍後再試或與教會聯絡' }, 502);
  }

  const now = new Date().toISOString();
  await env.DB
    .prepare(
      `INSERT INTO donations (
         id, created_at, updated_at, donor_name, donor_email, category, note,
         amount_cents, covered_fee_cents, gross_cents, currency,
         type, status, source, stripe_payment_intent_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      donationId, now, now, input.donorName, input.donorEmail, input.category, input.note,
      amounts.amountCents, amounts.coveredFeeCents, amounts.grossCents, 'usd',
      'one-time', 'pending', 'stripe', intent.id,
    )
    .run();

  return json({
    donationId,
    clientSecret: intent.clientSecret,
    amountCents: amounts.amountCents,
    coveredFeeCents: amounts.coveredFeeCents,
    grossCents: amounts.grossCents,
  }, 201);
}
```

- [ ] **Step 2: 掛上路由**

在 `/api/giving/config` 路由之後加入：

```ts
    if (url.pathname === '/api/giving/intent' && request.method === 'POST') {
      return handleGivingIntent(request, env);
    }
```

- [ ] **Step 3: 設定測試金鑰並驗證**

先設定本地開發用的 Stripe test secret key（從 Stripe 後台 Test mode 取得）：

```bash
echo "STRIPE_SECRET_KEY=sk_test_你的測試金鑰" >> Church/.dev.vars
```

確認 `.dev.vars` 已被 git 忽略：

```bash
git check-ignore Church/.dev.vars && echo "已忽略，安全"
```

預期：印出 `已忽略，安全`。若沒有輸出，**先把 `.dev.vars` 加進 `.gitignore` 再繼續** —— 這個檔案含 secret key，絕不能 commit。

- [ ] **Step 4: 驗證金額由伺服器決定**

```bash
npm run build && npx wrangler dev --port 8787
```

另開終端機，送一筆合法請求：

```bash
curl -s -X POST http://127.0.0.1:8787/api/giving/intent \
  -H 'Content-Type: application/json' \
  -d '{"amountCents":10000,"category":"什一","donorName":"測試","donorEmail":"test@example.com","coverFee":true,"note":""}'
```

預期：回傳 `"grossCents":10256`、`"coveredFeeCents":256`，並含 `clientSecret`

送一筆挾帶偽造總額的請求，確認被忽略：

```bash
curl -s -X POST http://127.0.0.1:8787/api/giving/intent \
  -H 'Content-Type: application/json' \
  -d '{"amountCents":100,"grossCents":50000,"category":"什一","donorName":"測試","donorEmail":"test@example.com","coverFee":false,"note":""}'
```

預期：回傳 `"grossCents":100`（偽造的 50000 被忽略）

送一筆金額違規的請求：

```bash
curl -s -X POST http://127.0.0.1:8787/api/giving/intent \
  -H 'Content-Type: application/json' \
  -d '{"amountCents":50,"category":"什一","donorName":"測試","donorEmail":"test@example.com","coverFee":false,"note":""}'
```

預期：HTTP 400，`"field":"amountCents"`，訊息為繁體中文

驗證完按 Ctrl+C 停掉 `wrangler dev`。

- [ ] **Step 5: Commit**

```bash
git add Church/server.ts
git commit -m "feat(church): 建立奉獻付款意向 POST /api/giving/intent"
```

---

## Task 12: 感謝信

**Files:**
- Create: `Church/giving/receiptEmail.ts`
- Test: `Church/giving/receiptEmail.test.ts`

- [ ] **Step 1: 寫失敗的測試**

建立 `Church/giving/receiptEmail.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { buildReceiptEmail, formatCents } from './receiptEmail';

const base = {
  donorName: '王小明',
  category: '什一',
  amountCents: 10000,
  coveredFeeCents: 256,
  grossCents: 10256,
  createdAt: '2026-09-23T18:30:00.000Z',
};

describe('formatCents', () => {
  it('分轉為兩位小數的美元字串', () => {
    expect(formatCents(10256)).toBe('102.56');
    expect(formatCents(100)).toBe('1.00');
    expect(formatCents(0)).toBe('0.00');
    expect(formatCents(5)).toBe('0.05');
  });

  it('千分位分隔', () => {
    expect(formatCents(250000000)).toBe('2,500,000.00');
  });
});

describe('buildReceiptEmail', () => {
  it('主旨與內文為繁體中文', () => {
    const mail = buildReceiptEmail(base);
    expect(mail.subject).toContain('奉獻');
    expect(mail.html).toContain('王小明');
  });

  it('列出本金、代付手續費與總額', () => {
    const mail = buildReceiptEmail(base);
    expect(mail.html).toContain('100.00');
    expect(mail.html).toContain('2.56');
    expect(mail.html).toContain('102.56');
  });

  it('未代付手續費時不顯示手續費列', () => {
    const mail = buildReceiptEmail({ ...base, coveredFeeCents: 0, grossCents: 10000 });
    expect(mail.html).not.toContain('交易手續費');
  });

  it('含報稅用語', () => {
    expect(buildReceiptEmail(base).html).toContain('報稅');
  });

  it('含奉獻用途', () => {
    expect(buildReceiptEmail(base).html).toContain('什一');
  });

  it('跳脫姓名中的 HTML，避免注入', () => {
    const mail = buildReceiptEmail({ ...base, donorName: '<script>alert(1)</script>' });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('跳脫用途中的 HTML', () => {
    const mail = buildReceiptEmail({ ...base, category: '<img onerror=x>' });
    expect(mail.html).not.toContain('<img onerror');
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx vitest run giving/receiptEmail.test.ts
```

預期：FAIL，`Failed to resolve import "./receiptEmail"`

- [ ] **Step 3: 寫實作**

建立 `Church/giving/receiptEmail.ts`：

```ts
/** 奉獻感謝信。純函式組裝 HTML，寄送由 server.ts 透過既有的 Resend 管道處理。 */

export type ReceiptData = {
  donorName: string;
  category: string;
  amountCents: number;
  coveredFeeCents: number;
  grossCents: number;
  createdAt: string;
};

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value: string): string {
  return String(value || '').replace(
    /[&<>"']/g,
    ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch),
  );
}

export function buildReceiptEmail(data: ReceiptData): { subject: string; html: string } {
  const date = new Date(data.createdAt).toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  // 代付手續費部分同屬可抵扣的慈善捐贈，所以報稅金額用總額。
  // 明列出來，奉獻者對帳時才不會困惑為什麼帳單金額比填的多。
  const feeRow = data.coveredFeeCents > 0
    ? `<tr><td style="padding:6px 12px;color:#555;">交易手續費（您自願代付）</td><td style="padding:6px 12px;text-align:right;">$${formatCents(data.coveredFeeCents)}</td></tr>`
    : '';

  const html = `<div style="font-family:'Noto Sans TC',Arial,sans-serif;font-size:14px;color:#172033;max-width:520px;line-height:1.7;">
  <h2 style="margin:0 0 16px 0;color:#1d4ed8;">感謝您的奉獻</h2>
  <p style="margin:0 0 12px;">${escapeHtml(data.donorName)} 弟兄姊妹平安：</p>
  <p style="margin:0 0 16px;">我們已收到您的奉獻，願神紀念您的擺上。以下是這次奉獻的明細：</p>
  <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;width:100%;margin:0 0 16px;">
    <tr><td style="padding:6px 12px;color:#555;">日期</td><td style="padding:6px 12px;text-align:right;">${escapeHtml(date)}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">奉獻用途</td><td style="padding:6px 12px;text-align:right;">${escapeHtml(data.category)}</td></tr>
    <tr><td style="padding:6px 12px;color:#555;">奉獻金額</td><td style="padding:6px 12px;text-align:right;">$${formatCents(data.amountCents)}</td></tr>
    ${feeRow}
    <tr style="background:#f8fafc;font-weight:bold;"><td style="padding:8px 12px;">總計</td><td style="padding:8px 12px;text-align:right;">$${formatCents(data.grossCents)}</td></tr>
  </table>
  <p style="margin:0 0 12px;">本次奉獻總額 $${formatCents(data.grossCents)} 可作為報稅之用。年終時教會會另外寄送全年奉獻證明。</p>
  <p style="margin:0 0 4px;">Bread of Life Christian Church on the Plateau</p>
  <p style="margin:0 0 4px;color:#555;">65 Front St. S. Issaquah, WA 98027</p>
  <p style="margin:0 0 16px;color:#555;">(425) 898-7650 · bolccop@gmail.com</p>
  <p style="margin:14px 0 0;color:#888;font-size:12px;">此郵件由教會網站系統自動發送。如有疑問請直接回覆或來電。</p>
</div>`;

  return { subject: `感謝您的奉獻 — Bread of Life Christian Church`, html };
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx vitest run giving/receiptEmail.test.ts
```

預期：PASS

- [ ] **Step 5: Commit**

```bash
git add Church/giving/receiptEmail.ts Church/giving/receiptEmail.test.ts
git commit -m "feat(church): 奉獻感謝信內容組裝"
```

---

## Task 13: `POST /api/giving/webhook` 路由

**Files:**
- Modify: `Church/server.ts`

- [ ] **Step 1: 加 import**

在 Task 10 加入的 import 區塊後補上：

```ts
import { buildReceiptEmail } from './giving/receiptEmail';
```

- [ ] **Step 2: 寫 handler**

在 `Church/server.ts` 的 `handleGivingIntent` 之後加入：

```ts
type StripeWebhookEvent = {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
};

/** 寄感謝信。失敗只記 log —— 錢已經收了，不該讓寄信失敗連累 webhook。 */
async function sendGivingReceipt(env: Env, donationId: string): Promise<void> {
  const row = await env.DB
    .prepare('SELECT * FROM donations WHERE id = ?')
    .bind(donationId)
    .first<DonationRow>();
  if (!row || !row.donor_email) return;

  const mail = buildReceiptEmail({
    donorName: row.donor_name ?? '',
    category: row.category ?? '',
    amountCents: row.amount_cents,
    coveredFeeCents: row.covered_fee_cents,
    grossCents: row.gross_cents,
    createdAt: row.created_at,
  });

  const result = await sendResendEmail(env, {
    from: 'Bread of Life Christian Church <giving@bolccop.org>',
    to: row.donor_email,
    replyTo: 'bolccop@gmail.com',
    subject: mail.subject,
    html: mail.html,
  });
  if (!result.ok) {
    console.error('Giving receipt email failed', donationId, result.error);
  }
}

async function handleGivingWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET not configured; rejecting webhook');
    return json({ error: 'Webhook not configured' }, 500);
  }

  // 必須拿未經解析的原始字串。先 parse 再 stringify 會改變位元組，簽章就對不上。
  const payload = await request.text();
  const verified = await verifyStripeSignature({
    payload,
    header: request.headers.get('Stripe-Signature'),
    secret: env.STRIPE_WEBHOOK_SECRET,
  });
  if (!verified) {
    // 分開記錄「沒帶簽章」與「帶了但驗不過」。驗簽函式只回 boolean，
    // 所以設定錯了金鑰跟真的有人偽造，對外症狀一模一樣；日誌若不分，
    // 上線後對著 Stripe 後台查問題會完全無從下手。
    // 注意只寫進日誌，不要回給客戶端 —— 那等於告訴攻擊者他卡在哪一關。
    console.error(
      request.headers.get('Stripe-Signature')
        ? 'Stripe webhook signature present but invalid (check STRIPE_WEBHOOK_SECRET matches the endpoint)'
        : 'Stripe webhook missing Stripe-Signature header',
    );
    return json({ error: 'Invalid signature' }, 400);
  }

  let event: StripeWebhookEvent;
  try {
    event = JSON.parse(payload) as StripeWebhookEvent;
  } catch {
    return json({ error: 'Invalid payload' }, 400);
  }

  const object = event.data?.object ?? {};
  const now = new Date().toISOString();

  if (event.type === 'payment_intent.succeeded') {
    const intentId = typeof object.id === 'string' ? object.id : '';
    if (!intentId) return json({ received: true });

    // 去重：只有仍處於 pending 的記錄會被更新。Stripe 重送同一事件時
    // 第二次的 changes 會是 0，不會產生第二筆或重複寄信。
    const result = await env.DB
      .prepare(
        `UPDATE donations SET status = 'completed', updated_at = ?, receipt_url = ?
         WHERE stripe_payment_intent_id = ? AND status = 'pending'`,
      )
      .bind(now, typeof object.receipt_url === 'string' ? object.receipt_url : null, intentId)
      .run();

    if ((result.meta?.changes ?? 0) > 0) {
      const donationId = typeof (object.metadata as Record<string, unknown> | undefined)?.donation_id === 'string'
        ? String((object.metadata as Record<string, unknown>).donation_id)
        : '';
      if (donationId) {
        ctx.waitUntil(sendGivingReceipt(env, donationId));
      }
    }
    return json({ received: true });
  }

  if (event.type === 'payment_intent.payment_failed') {
    const intentId = typeof object.id === 'string' ? object.id : '';
    const lastError = object.last_payment_error as { message?: string } | undefined;
    if (intentId) {
      await env.DB
        .prepare(
          `UPDATE donations SET status = 'failed', updated_at = ?, failure_message = ?
           WHERE stripe_payment_intent_id = ? AND status = 'pending'`,
        )
        .bind(now, lastError?.message ?? null, intentId)
        .run();
    }
    return json({ received: true });
  }

  if (event.type === 'charge.refunded') {
    const intentId = typeof object.payment_intent === 'string' ? object.payment_intent : '';
    if (intentId) {
      await env.DB
        .prepare(
          `UPDATE donations SET status = 'refunded', updated_at = ?
           WHERE stripe_payment_intent_id = ? AND status = 'completed'`,
        )
        .bind(now, intentId)
        .run();
    }
    return json({ received: true });
  }

  // 其餘事件照收不誤，回 200 免得 Stripe 一直重送
  return json({ received: true });
}
```

- [ ] **Step 3: 掛上路由**

在 `/api/giving/intent` 路由之後加入：

```ts
    if (url.pathname === '/api/giving/webhook' && request.method === 'POST') {
      return handleGivingWebhook(request, env, ctx);
    }
```

> 若該處的 handler 作用域沒有 `ctx`，請往上找 `async fetch(request, env, ctx)` 確認，並把 `ctx` 一路傳進來。

- [ ] **Step 4: 用 Stripe CLI 驗證**

安裝並登入 Stripe CLI（若尚未安裝，見 https://stripe.com/docs/stripe-cli）：

```bash
stripe login
```

啟動本地 Worker 與事件轉發（兩個終端機）：

```bash
npm run build && npx wrangler dev --port 8787
```

```bash
stripe listen --forward-to http://127.0.0.1:8787/api/giving/webhook
```

`stripe listen` 會印出一組 `whsec_...`，把它寫進 `.dev.vars` 並重啟 `wrangler dev`：

```bash
echo "STRIPE_WEBHOOK_SECRET=whsec_剛剛印出的值" >> Church/.dev.vars
```

- [ ] **Step 5: 驗證簽章把關有效**

送一個沒有簽章的請求：

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/giving/webhook \
  -H 'Content-Type: application/json' -d '{"type":"payment_intent.succeeded"}'
```

預期：`400`

- [ ] **Step 6: Commit**

```bash
git add Church/server.ts
git commit -m "feat(church): Stripe webhook 端點（驗簽、去重、感謝信）"
```

---

## Task 14: `GET /api/giving/status/:id` 路由

**Files:**
- Modify: `Church/server.ts`

- [ ] **Step 1: 寫 handler**

在 `handleGivingWebhook` 之後加入：

```ts
/**
 * 供前端在「已付款但 webhook 尚未送達」時輪詢。
 * 只回狀態，不回姓名、email、金額 —— donationId 雖是 UUID，
 * 仍不該讓知道 id 的人讀到個資。
 */
async function handleGivingStatus(donationId: string, env: Env): Promise<Response> {
  const row = await env.DB
    .prepare('SELECT status FROM donations WHERE id = ?')
    .bind(donationId)
    .first<{ status: string }>();
  if (!row) return notFound('找不到這筆奉獻記錄');
  return json({ status: row.status });
}
```

- [ ] **Step 2: 掛上路由**

在 `/api/giving/webhook` 路由之後加入：

```ts
    const givingStatusMatch = url.pathname.match(/^\/api\/giving\/status\/([^/]+)$/);
    if (givingStatusMatch && request.method === 'GET') {
      return handleGivingStatus(decodeURIComponent(givingStatusMatch[1]), env);
    }
```

- [ ] **Step 3: 驗證**

```bash
npm run build && npx wrangler dev --port 8787
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8787/api/giving/status/does-not-exist
```

預期：`404`

- [ ] **Step 4: Commit**

```bash
git add Church/server.ts
git commit -m "feat(church): 奉獻狀態查詢端點"
```

---

## Task 15: CSV 匯出

**Files:**
- Create: `Church/giving/csv.ts`
- Test: `Church/giving/csv.test.ts`
- Modify: `Church/server.ts`

- [ ] **Step 1: 寫失敗的測試**

建立 `Church/giving/csv.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { buildDonationsCsv, CSV_HEADERS } from './csv';

const row = {
  createdAt: '2026-09-23T18:30:00.000Z',
  donorName: '王小明',
  donorEmail: 'test@example.com',
  category: '什一',
  amountCents: 10000,
  coveredFeeCents: 256,
  grossCents: 10256,
  status: 'completed',
  note: '感謝神',
};

describe('buildDonationsCsv', () => {
  it('第一列是標頭', () => {
    const csv = buildDonationsCsv([]);
    expect(csv.split('\r\n')[0]).toBe(CSV_HEADERS.join(','));
  });

  it('金額輸出為元而非分', () => {
    const csv = buildDonationsCsv([row]);
    expect(csv).toContain('100.00');
    expect(csv).toContain('102.56');
  });

  it('含逗號的欄位加上引號', () => {
    const csv = buildDonationsCsv([{ ...row, note: '奉獻,感恩' }]);
    expect(csv).toContain('"奉獻,感恩"');
  });

  it('含引號的欄位跳脫為兩個引號', () => {
    const csv = buildDonationsCsv([{ ...row, donorName: '王"小明"' }]);
    expect(csv).toContain('"王""小明"""');
  });

  it('含換行的欄位加上引號', () => {
    const csv = buildDonationsCsv([{ ...row, note: '第一行\n第二行' }]);
    expect(csv).toContain('"第一行\n第二行"');
  });

  it('以等號前綴開頭的值被中和，避免 Excel 公式注入', () => {
    const csv = buildDonationsCsv([{ ...row, donorName: '=1+1' }]);
    expect(csv).not.toMatch(/,=1\+1/);
    expect(csv).toContain("'=1+1");
  });

  it('null 欄位輸出為空字串', () => {
    const csv = buildDonationsCsv([{ ...row, donorEmail: null, note: null }]);
    const line = csv.split('\r\n')[1];
    expect(line).toContain(',,');
  });

  it('日期轉為太平洋時區的 YYYY-MM-DD', () => {
    // 2026-09-23T18:30Z 在太平洋夏令時間是同日 11:30
    expect(buildDonationsCsv([row])).toContain('2026-09-23');
  });

  it('用 CRLF 換行（Excel 相容）', () => {
    expect(buildDonationsCsv([row])).toContain('\r\n');
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx vitest run giving/csv.test.ts
```

預期：FAIL，`Failed to resolve import "./csv"`

- [ ] **Step 3: 寫實作**

建立 `Church/giving/csv.ts`：

```ts
/** 奉獻記錄匯出 CSV，欄位對齊 Finance 系統的 Offering 結構，供同工手動匯入。 */

export const CSV_HEADERS = ['日期', '姓名', 'Email', '用途', '奉獻金額', '代付手續費', '總額', '狀態', '留言'] as const;

export type CsvRow = {
  createdAt: string;
  donorName: string | null;
  donorEmail: string | null;
  category: string | null;
  amountCents: number;
  coveredFeeCents: number;
  grossCents: number;
  status: string;
  note: string | null;
};

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function toPacificDate(iso: string): string {
  // en-CA 的日期格式恰好是 YYYY-MM-DD
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

/**
 * 逃逸一個 CSV 欄位。
 *
 * 除了標準的引號處理，還要中和以 = + - @ 開頭的值：
 * Excel 會把它們當公式執行，這是常見的 CSV 注入手法。
 */
function escapeField(value: string | null): string {
  let text = value ?? '';
  if (/^[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildDonationsCsv(rows: CsvRow[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push([
      escapeField(toPacificDate(row.createdAt)),
      escapeField(row.donorName),
      escapeField(row.donorEmail),
      escapeField(row.category),
      escapeField(centsToDollars(row.amountCents)),
      escapeField(centsToDollars(row.coveredFeeCents)),
      escapeField(centsToDollars(row.grossCents)),
      escapeField(row.status),
      escapeField(row.note),
    ].join(','));
  }
  return lines.join('\r\n');
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx vitest run giving/csv.test.ts
```

預期：PASS

- [ ] **Step 5: 加匯出路由**

在 `Church/server.ts` 的 import 區塊加入：

```ts
import { buildDonationsCsv } from './giving/csv';
```

在 `handleGivingStatus` 之後加入 handler：

```ts
async function handleDonationsCsvExport(request: Request, env: Env): Promise<Response> {
  const user = await getCurrentUser(request, env);
  if (!user) return unauthorized();
  // 奉獻資料含個資與金額，只有 owner 能匯出
  if (user.role !== 'owner') return forbidden();

  const result = await env.DB
    .prepare('SELECT * FROM donations ORDER BY created_at DESC')
    .all<DonationRow>();

  const csv = buildDonationsCsv((result.results ?? []).map(row => ({
    createdAt: row.created_at,
    donorName: row.donor_name,
    donorEmail: row.donor_email,
    category: row.category,
    amountCents: row.amount_cents,
    coveredFeeCents: row.covered_fee_cents,
    grossCents: row.gross_cents,
    status: row.status,
    note: row.note,
  })));

  const filename = `donations-${new Date().toISOString().slice(0, 10)}.csv`;
  // BOM 讓 Excel 正確辨識 UTF-8，否則中文會變亂碼
  return new Response(`﻿${csv}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
```

掛上路由（放在其他 `/api/admin/` 路由附近）：

```ts
    if (url.pathname === '/api/admin/donations/export.csv' && request.method === 'GET') {
      return handleDonationsCsvExport(request, env);
    }
```

- [ ] **Step 6: 型別檢查**

```bash
npm run typecheck
```

預期：PASS

- [ ] **Step 7: Commit**

```bash
git add Church/giving/csv.ts Church/giving/csv.test.ts Church/server.ts
git commit -m "feat(church): 奉獻記錄 CSV 匯出"
```

---

## Task 16: 前端文案

**Files:**
- Modify: `Church/constants/translations.ts`

- [ ] **Step 1: 擴充 giving 區塊**

把 `Church/constants/translations.ts` 中的 `giving:` 整個區塊替換為：

```ts
  giving: {
    title: { en: 'Give Generously', zh: '慷慨奉獻' },
    subtitle: { en: 'Your support helps us spread the message of faith, hope, and love.', zh: '您的支持幫助我們傳播信、望、愛的信息。' },
    oneTime: { en: 'One-Time', zh: '單次奉獻' },
    recurring: { en: 'Recurring', zh: '定期奉獻' },
    amount: { en: 'Amount', zh: '金額' },
    giveNow: { en: 'Give Now', zh: '立即奉獻' },
    securityNote: { en: 'All transactions are secure and encrypted.', zh: '所有交易均經過安全加密。' },

    customAmount: { en: 'Other Amount', zh: '其他金額' },
    category: { en: 'Designation', zh: '奉獻用途' },
    name: { en: 'Name', zh: '姓名' },
    email: { en: 'Email', zh: '電子郵件' },
    emailHint: { en: 'We will send your receipt here.', zh: '奉獻收據將寄到這個信箱。' },
    note: { en: 'Message or Prayer Request (optional)', zh: '留言或代禱事項（選填）' },
    coverFee: { en: 'I would like to cover the transaction fee', zh: '我願意代付交易手續費' },
    coverFeeDetail: { en: 'Your card will be charged {gross}, so the church receives the full {amount}.', zh: '您的卡片將扣款 {gross}，教會可完整收到 {amount}。' },
    totalCharged: { en: 'Total charged', zh: '實際扣款' },
    submitting: { en: 'Processing…', zh: '處理中…' },

    resultProcessingTitle: { en: 'Processing your gift…', zh: '正在確認您的奉獻…' },
    resultProcessingText: { en: 'This usually takes a few seconds.', zh: '通常只需要幾秒鐘，請稍候。' },
    resultSuccessTitle: { en: 'Thank you for your gift', zh: '感謝您的奉獻' },
    resultSuccessText: { en: 'May God bless your generosity. A receipt has been sent to your email.', zh: '願神紀念您的擺上。奉獻收據已寄到您的信箱。' },
    resultPendingTitle: { en: 'Your gift has been submitted', zh: '您的奉獻已送出' },
    resultPendingText: { en: 'Your payment went through. The confirmation email will arrive shortly.', zh: '付款已完成，確認信稍後就會寄達。' },
    resultFailedTitle: { en: 'Payment was not completed', zh: '這次付款沒有完成' },
    giveAgain: { en: 'Give Again', zh: '再次奉獻' },
    tryAgain: { en: 'Try Again', zh: '重新嘗試' },

    errorGeneric: { en: 'Something went wrong. Please try again or contact the church.', zh: '發生問題，請重新嘗試或與教會聯絡。' },
    errorCardDeclined: { en: 'Your card was declined by the issuing bank. Please try another card or contact your bank.', zh: '這張卡被發卡銀行拒絕了，請換一張卡或與您的銀行聯絡。' },
    errorExpiredCard: { en: 'This card has expired. Please use another card.', zh: '這張卡已過期，請改用其他卡片。' },
    errorIncorrectCvc: { en: 'The security code is incorrect.', zh: '卡片安全碼不正確。' },
    errorProcessing: { en: 'The card could not be processed. Please try again in a moment.', zh: '卡片無法處理，請稍後再試一次。' },
    errorDisabled: { en: 'Online giving is temporarily unavailable. Please use another way to give.', zh: '線上奉獻暫時無法使用，請改用其他奉獻方式。' },

    recurringComingSoonTitle: { en: 'Recurring Giving Is Coming Soon', zh: '定期奉獻即將推出' },
    recurringComingSoonText: { en: 'We are still building this. To set up recurring giving today, please contact the church office and we will help you.', zh: '這項功能還在建置中。若您現在就想設定定期奉獻，請與教會辦公室聯絡，我們會協助您安排。' },
  },
```

- [ ] **Step 2: 型別檢查**

```bash
npm run typecheck
```

預期：PASS

- [ ] **Step 3: Commit**

```bash
git add Church/constants/translations.ts
git commit -m "feat(church): 奉獻表單繁體中文文案"
```

---

## Task 17: 安裝前端相依套件

**Files:**
- Modify: `Church/package.json`

- [ ] **Step 1: 安裝**

```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

- [ ] **Step 2: 確認安裝成功**

```bash
node -e "console.log(require('./package.json').dependencies['@stripe/stripe-js'], require('./package.json').dependencies['@stripe/react-stripe-js'])"
```

預期：印出兩個版本號

- [ ] **Step 3: Commit**

```bash
git add Church/package.json Church/package-lock.json
git commit -m "chore(church): 安裝 Stripe 前端 SDK"
```

---

## Task 18: 設定 hook 與金額選擇元件

**Files:**
- Create: `Church/components/giving/useGivingConfig.ts`
- Create: `Church/components/giving/AmountSelector.tsx`

- [ ] **Step 1: 寫 useGivingConfig**

建立 `Church/components/giving/useGivingConfig.ts`：

```ts
import { useEffect, useState } from 'react';

export type GivingConfig = {
  publishableKey: string;
  enabled: boolean;
  categories: string[];
  currency: string;
  feePercent: number;
  feeFixedCents: number;
};

type State =
  | { status: 'loading' }
  | { status: 'ready'; config: GivingConfig }
  | { status: 'error' };

export function useGivingConfig(): State {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/giving/config')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((config: GivingConfig) => {
        if (!cancelled) setState({ status: 'ready', config });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });
    return () => { cancelled = true; };
  }, []);

  return state;
}

/**
 * 前端的手續費預估，只為了即時顯示金額。
 * 真正送出的金額以伺服器計算為準（見 giving/fee.ts），兩邊公式必須一致。
 */
export function estimateGross(amountCents: number, coverFee: boolean, config: GivingConfig): number {
  if (!coverFee) return amountCents;
  const percentBp = Math.round(config.feePercent * 100);
  return Math.ceil(((amountCents + config.feeFixedCents) * 10000) / (10000 - percentBp));
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
```

- [ ] **Step 2: 寫 AmountSelector**

建立 `Church/components/giving/AmountSelector.tsx`：

```tsx
import React from 'react';
import { useLocalization } from '../../hooks/useLocalization';

const PRESETS = [50, 100, 200, 500];

interface AmountSelectorProps {
  /** 以元為單位的字串，維持輸入框的原樣（允許使用者打到一半） */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const AmountSelector: React.FC<AmountSelectorProps> = ({ value, onChange, disabled }) => {
  const { t } = useLocalization();

  return (
    <div>
      <label htmlFor="giving-amount" className="block text-sm font-medium text-gray-700 mb-2">
        {t('giving.amount')}
      </label>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {PRESETS.map(preset => (
          <button
            key={preset}
            type="button"
            disabled={disabled}
            onClick={() => onChange(String(preset))}
            className={`py-3 px-4 border rounded-lg font-semibold transition-all disabled:opacity-50 ${
              String(preset) === value
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-500'
            }`}
          >
            ${preset}
          </button>
        ))}
      </div>
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 text-xl">$</span>
        <input
          id="giving-amount"
          type="number"
          inputMode="decimal"
          min="1"
          step="0.01"
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          placeholder={t('giving.customAmount')}
          className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg text-xl focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100"
        />
      </div>
    </div>
  );
};

export default AmountSelector;
```

- [ ] **Step 3: 型別檢查**

```bash
npm run typecheck
```

預期：PASS

- [ ] **Step 4: Commit**

```bash
git add Church/components/giving/useGivingConfig.ts Church/components/giving/AmountSelector.tsx
git commit -m "feat(church): 奉獻設定 hook 與金額選擇元件"
```

---

## Task 19: 手續費勾選與結果畫面元件

**Files:**
- Create: `Church/components/giving/FeeCoverToggle.tsx`
- Create: `Church/components/giving/GivingResult.tsx`
- Create: `Church/components/giving/RecurringComingSoon.tsx`

- [ ] **Step 1: 寫 FeeCoverToggle**

建立 `Church/components/giving/FeeCoverToggle.tsx`：

```tsx
import React from 'react';
import { useLocalization } from '../../hooks/useLocalization';
import { formatCents } from './useGivingConfig';

interface FeeCoverToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  amountCents: number;
  grossCents: number;
  disabled?: boolean;
}

const FeeCoverToggle: React.FC<FeeCoverToggleProps> = ({ checked, onChange, amountCents, grossCents, disabled }) => {
  const { t } = useLocalization();

  // 只寫「我願意代付手續費」而不講金額，等於讓使用者盲簽。金額一定要看得見。
  const detail = t('giving.coverFeeDetail')
    .replace('{gross}', formatCents(grossCents))
    .replace('{amount}', formatCents(amountCents));

  return (
    <label className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm">
        <span className="font-medium text-gray-900">{t('giving.coverFee')}</span>
        {checked && amountCents > 0 && (
          <span className="mt-1 block text-gray-600">{detail}</span>
        )}
      </span>
    </label>
  );
};

export default FeeCoverToggle;
```

- [ ] **Step 2: 寫 GivingResult**

建立 `Church/components/giving/GivingResult.tsx`：

```tsx
import React from 'react';
import { useLocalization } from '../../hooks/useLocalization';

export type ResultKind = 'processing' | 'success' | 'pending' | 'failed';

interface GivingResultProps {
  kind: ResultKind;
  /** 失敗時顯示的具體訊息 */
  message?: string;
  onReset: () => void;
}

const GivingResult: React.FC<GivingResultProps> = ({ kind, message, onReset }) => {
  const { t } = useLocalization();

  if (kind === 'processing') {
    return (
      <div className="max-w-lg mx-auto bg-white p-8 rounded-xl shadow-lg mt-8 text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
        <h3 className="text-2xl font-bold mb-2">{t('giving.resultProcessingTitle')}</h3>
        <p className="text-gray-600">{t('giving.resultProcessingText')}</p>
      </div>
    );
  }

  if (kind === 'failed') {
    return (
      <div className="max-w-lg mx-auto bg-white p-8 rounded-xl shadow-lg mt-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-500">
          <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h3 className="text-2xl font-bold mb-2">{t('giving.resultFailedTitle')}</h3>
        <p className="text-gray-600 mb-6">{message || t('giving.errorGeneric')}</p>
        <button onClick={onReset} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700">
          {t('giving.tryAgain')}
        </button>
      </div>
    );
  }

  // success 與 pending 對奉獻者來說都是「錢已經付了」，差別只在確認信是否已寄出。
  // 不該因為 webhook 慢了幾秒就讓人以為出事。
  const isSuccess = kind === 'success';
  return (
    <div className="max-w-lg mx-auto bg-white p-8 rounded-xl shadow-lg mt-8 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-500">
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h3 className="text-2xl font-bold mb-2">
        {isSuccess ? t('giving.resultSuccessTitle') : t('giving.resultPendingTitle')}
      </h3>
      <p className="text-gray-600 mb-6">
        {isSuccess ? t('giving.resultSuccessText') : t('giving.resultPendingText')}
      </p>
      <button onClick={onReset} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700">
        {t('giving.giveAgain')}
      </button>
    </div>
  );
};

export default GivingResult;
```

- [ ] **Step 3: 寫 RecurringComingSoon**

建立 `Church/components/giving/RecurringComingSoon.tsx`：

```tsx
import React from 'react';
import { useLocalization } from '../../hooks/useLocalization';

/**
 * 定期奉獻第二期才做。在那之前顯示過渡內容 ——
 * 留一個按了沒反應的假按鈕，比誠實說「還沒好」糟糕得多。
 */
const RecurringComingSoon: React.FC = () => {
  const { t } = useLocalization();

  return (
    <div className="max-w-lg mx-auto bg-white p-8 rounded-xl shadow-lg mt-8 text-center">
      <h3 className="text-xl font-bold text-gray-900 mb-3">{t('giving.recurringComingSoonTitle')}</h3>
      <p className="text-gray-600 mb-6">{t('giving.recurringComingSoonText')}</p>
      <div className="space-y-2 rounded-lg bg-gray-50 p-4">
        <p>
          <a href="tel:4258987650" className="font-semibold text-blue-700 hover:text-blue-800">(425) 898-7650</a>
        </p>
        <p>
          <a href="mailto:bolccop@gmail.com" className="font-semibold text-blue-700 hover:text-blue-800">bolccop@gmail.com</a>
        </p>
      </div>
    </div>
  );
};

export default RecurringComingSoon;
```

- [ ] **Step 4: 型別檢查**

```bash
npm run typecheck
```

預期：PASS

- [ ] **Step 5: Commit**

```bash
git add Church/components/giving/FeeCoverToggle.tsx Church/components/giving/GivingResult.tsx Church/components/giving/RecurringComingSoon.tsx
git commit -m "feat(church): 手續費勾選、結果畫面與定期奉獻過渡元件"
```

---

## Task 20: 表單主元件

**Files:**
- Create: `Church/components/giving/StripeGivingForm.tsx`

- [ ] **Step 1: 寫元件**

建立 `Church/components/giving/StripeGivingForm.tsx`：

```tsx
import React, { useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useLocalization } from '../../hooks/useLocalization';
import { useGivingConfig, estimateGross, formatCents, type GivingConfig } from './useGivingConfig';
import AmountSelector from './AmountSelector';
import FeeCoverToggle from './FeeCoverToggle';
import GivingResult, { type ResultKind } from './GivingResult';

type IntentResponse = {
  donationId: string;
  clientSecret: string;
  amountCents: number;
  coveredFeeCents: number;
  grossCents: number;
};

/** 把元字串轉為整數分。無法解析時回 0。 */
function dollarsToCents(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

/** Stripe 的錯誤代碼對一般奉獻者沒有意義，轉成看得懂的話。 */
function friendlyStripeError(code: string | undefined, t: (key: string) => string): string {
  switch (code) {
    case 'card_declined': return t('giving.errorCardDeclined');
    case 'expired_card': return t('giving.errorExpiredCard');
    case 'incorrect_cvc': return t('giving.errorIncorrectCvc');
    case 'processing_error': return t('giving.errorProcessing');
    default: return t('giving.errorGeneric');
  }
}

// ---------------------------------------------------------------------------
// 付款步驟：已經拿到 clientSecret，掛載 Payment Element 讓使用者輸入卡號
// ---------------------------------------------------------------------------

interface PaymentStepProps {
  donationId: string;
  onDone: (kind: ResultKind, message?: string) => void;
  onBack: () => void;
  grossCents: number;
}

const PaymentStep: React.FC<PaymentStepProps> = ({ donationId, onDone, onBack, grossCents }) => {
  const { t } = useLocalization();
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /**
   * 輪詢後端狀態。使用者付款成功的瞬間 webhook 可能還沒到，
   * 此時直接說「完成」是在猜，說「失敗」則是嚇人。最多等 10 秒，
   * 逾時就顯示 pending —— 錢確實已經收了，只是尚未落地。
   */
  const pollStatus = async (): Promise<ResultKind> => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const res = await fetch(`/api/giving/status/${encodeURIComponent(donationId)}`);
        if (!res.ok) continue;
        const data = await res.json() as { status: string };
        if (data.status === 'completed') return 'success';
        if (data.status === 'failed') return 'failed';
      } catch {
        // 網路抖動不該中斷輪詢
      }
    }
    return 'pending';
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError('');
    onDone('processing');

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (stripeError) {
      const message = friendlyStripeError(stripeError.code, t);
      setError(message);
      setSubmitting(false);
      onBack();
      return;
    }

    // 前端回報成功只用來切畫面。真正寫入 completed 的是 webhook，
    // 所以這裡必須回頭問伺服器，不能自行宣告完成。
    onDone(await pollStatus());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full rounded-lg bg-blue-600 py-4 text-lg font-bold text-white transition-all hover:bg-blue-700 disabled:opacity-60"
      >
        {submitting ? t('giving.submitting') : `${t('giving.giveNow')} ${formatCents(grossCents)}`}
      </button>
    </form>
  );
};

// ---------------------------------------------------------------------------
// 表單容器
// ---------------------------------------------------------------------------

const GivingFormInner: React.FC<{ config: GivingConfig }> = ({ config }) => {
  const { t } = useLocalization();
  const [amount, setAmount] = useState('100');
  const [category, setCategory] = useState(config.categories[0] ?? '');
  const [donorName, setDonorName] = useState('');
  const [donorEmail, setDonorEmail] = useState('');
  const [note, setNote] = useState('');
  const [coverFee, setCoverFee] = useState(false);

  const [intent, setIntent] = useState<IntentResponse | null>(null);
  const [result, setResult] = useState<ResultKind | null>(null);
  const [resultMessage, setResultMessage] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const stripePromise = useMemo(() => loadStripe(config.publishableKey), [config.publishableKey]);
  const amountCents = dollarsToCents(amount);
  const grossCents = estimateGross(amountCents, coverFee, config);

  const reset = () => {
    setIntent(null);
    setResult(null);
    setResultMessage('');
    setError('');
  };

  const handleCreateIntent = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setCreating(true);
    try {
      const response = await fetch('/api/giving/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 刻意不送總額或手續費 —— 那些由伺服器算
        body: JSON.stringify({ amountCents, category, donorName, donorEmail, coverFee, note }),
      });
      const data = await response.json() as IntentResponse & { error?: string };
      if (!response.ok) {
        setError(data.error || t('giving.errorGeneric'));
        return;
      }
      setIntent(data);
    } catch {
      setError(t('giving.errorGeneric'));
    } finally {
      setCreating(false);
    }
  };

  if (result) {
    return <GivingResult kind={result} message={resultMessage} onReset={reset} />;
  }

  if (intent) {
    return (
      <div className="mx-auto mt-8 max-w-lg rounded-xl bg-white p-8 shadow-lg">
        <Elements stripe={stripePromise} options={{ clientSecret: intent.clientSecret, locale: 'zh-TW' }}>
          <PaymentStep
            donationId={intent.donationId}
            grossCents={intent.grossCents}
            onDone={(kind, message) => { setResult(kind); setResultMessage(message ?? ''); }}
            onBack={() => setResult(null)}
          />
        </Elements>
      </div>
    );
  }

  return (
    <form onSubmit={handleCreateIntent} className="mx-auto mt-8 max-w-lg space-y-6 rounded-xl bg-white p-8 text-left shadow-lg">
      <AmountSelector value={amount} onChange={setAmount} disabled={creating} />

      <div>
        <label htmlFor="giving-category" className="mb-2 block text-sm font-medium text-gray-700">
          {t('giving.category')}
        </label>
        <select
          id="giving-category"
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {config.categories.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="giving-name" className="mb-2 block text-sm font-medium text-gray-700">
          {t('giving.name')}
        </label>
        <input
          id="giving-name"
          type="text"
          required
          value={donorName}
          onChange={e => setDonorName(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="giving-email" className="mb-2 block text-sm font-medium text-gray-700">
          {t('giving.email')}
        </label>
        <input
          id="giving-email"
          type="email"
          required
          value={donorEmail}
          onChange={e => setDonorEmail(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">{t('giving.emailHint')}</p>
      </div>

      <FeeCoverToggle
        checked={coverFee}
        onChange={setCoverFee}
        amountCents={amountCents}
        grossCents={grossCents}
        disabled={creating}
      />

      <div>
        <label htmlFor="giving-note" className="mb-2 block text-sm font-medium text-gray-700">
          {t('giving.note')}
        </label>
        <textarea
          id="giving-note"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={e => setNote(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="flex items-center justify-between border-t border-gray-200 pt-4">
        <span className="text-sm text-gray-600">{t('giving.totalCharged')}</span>
        <span className="text-2xl font-bold text-gray-900">{formatCents(grossCents)}</span>
      </div>

      <button
        type="submit"
        disabled={creating || amountCents <= 0}
        className="w-full rounded-lg bg-blue-600 py-4 text-lg font-bold text-white transition-all hover:bg-blue-700 disabled:opacity-60"
      >
        {creating ? t('giving.submitting') : t('giving.giveNow')}
      </button>
    </form>
  );
};

const StripeGivingForm: React.FC = () => {
  const { t } = useLocalization();
  const state = useGivingConfig();

  if (state.status === 'loading') {
    return (
      <div className="mx-auto mt-8 max-w-lg rounded-xl bg-white p-8 text-center shadow-lg">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
      </div>
    );
  }

  if (state.status === 'error' || !state.config.enabled || !state.config.publishableKey) {
    return (
      <div className="mx-auto mt-8 max-w-lg rounded-xl bg-white p-8 text-center shadow-lg">
        <p className="text-gray-600">{t('giving.errorDisabled')}</p>
      </div>
    );
  }

  return <GivingFormInner config={state.config} />;
};

export default StripeGivingForm;
```

- [ ] **Step 2: 型別檢查**

```bash
npm run typecheck
```

預期：PASS

- [ ] **Step 3: Commit**

```bash
git add Church/components/giving/StripeGivingForm.tsx
git commit -m "feat(church): Stripe Payment Element 奉獻表單"
```

---

## Task 21: 接上奉獻頁

**Files:**
- Modify: `Church/components/GivingPage.tsx`

- [ ] **Step 1: 移除舊的內嵌表單**

在 `Church/components/GivingPage.tsx` 刪除 Task 8 放進去的 `OnlineGivingComingSoon` 過渡元件，連同它的註解一起。（假的 `GivingForm` 已在 Task 8 移除，這裡要換掉的是那個過渡畫面。）Task 8 加的 `giving.onlineComingSoon` 文案也可以一併從 `translations.ts` 移除，因為不再有人用它。

- [ ] **Step 2: 更新 import**

把檔案開頭的 import 區塊替換為：

```tsx
import React, { useState, useEffect } from 'react';
import PageHeader from './PageHeader';
import { useLocalization } from '../hooks/useLocalization';
import { GivingSubPage } from '../types';
import { navigateTo as navigateToRoute } from '../utils/routes';
import Editable from './Editable';
import SecondaryNavBar from './SecondaryNavBar';
import StripeGivingForm from './giving/StripeGivingForm';
import RecurringComingSoon from './giving/RecurringComingSoon';
```

`useAdmin`、`LockIcon`、`churchAlert` 都只被刪掉的 `GivingForm` 用到，所以上面的 import 清單已經把它們拿掉了。Step 5 的 typecheck 會確認沒有殘留的未使用 import。

- [ ] **Step 3: 加入一次性／定期切換**

在 `GivingPage` 元件內，`const [activeTab, setActiveTab] = useState<GivingSubPage>(initialSubPage);` 之後加入：

```tsx
  const [givingType, setGivingType] = useState<'one-time' | 'recurring'>('one-time');
```

- [ ] **Step 4: 替換表單渲染處**

把檔案末尾的這一行：

```tsx
        {activeTab === 'ways-to-give' && <GivingForm />}
```

替換為：

```tsx
        {activeTab === 'ways-to-give' && (
          <div className="mx-auto max-w-lg">
            <div className="mt-8 grid grid-cols-2 gap-2 rounded-full bg-gray-200 p-1">
              <button
                type="button"
                onClick={() => setGivingType('one-time')}
                className={`w-full rounded-full py-2 font-semibold transition-colors ${
                  givingType === 'one-time' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-300'
                }`}
              >
                {t('giving.oneTime')}
              </button>
              <button
                type="button"
                onClick={() => setGivingType('recurring')}
                className={`w-full rounded-full py-2 font-semibold transition-colors ${
                  givingType === 'recurring' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-300'
                }`}
              >
                {t('giving.recurring')}
              </button>
            </div>
            {givingType === 'one-time' ? <StripeGivingForm /> : <RecurringComingSoon />}
          </div>
        )}
```

- [ ] **Step 5: 型別檢查**

```bash
npm run typecheck
```

預期：PASS。若報未使用的 import，依提示移除。

- [ ] **Step 6: 在瀏覽器確認畫面**

```bash
npm run dev
```

開啟 http://localhost:5173/giving/ways-to-give ，確認：
- 一次性／定期切換可運作
- 「定期」顯示「即將推出」與聯絡資訊，沒有假按鈕
- 一次性顯示完整表單（金額、用途、姓名、Email、代付手續費、留言）
- 勾選代付手續費後，「實際扣款」金額即時更新為 $102.56（金額填 100 時）

確認完按 Ctrl+C 停掉。

- [ ] **Step 7: Commit**

```bash
git add Church/components/GivingPage.tsx
git commit -m "feat(church): 奉獻頁接上 Stripe 表單，定期改為過渡畫面"
```

---

## Task 22: 管理後台

**Files:**
- Modify: `Church/components/AdminDashboard.tsx`

- [ ] **Step 1: 加狀態顯示對照表**

在 `Church/components/AdminDashboard.tsx` 的 import 區塊之後、元件定義之前，加入：

```tsx
const DONATION_STATUS_LABEL: Record<string, string> = {
  pending: '處理中',
  completed: '已完成',
  failed: '失敗',
  refunded: '已退款',
};

const DONATION_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-700',
};

function formatDonationAmount(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
```

- [ ] **Step 1.5: 總額改用伺服器端彙總，不要加總抓回來的陣列**

`handleBootstrap` 只回傳最近 500 筆（Task 7 加的 `LIMIT 500`）。後台目前把 `donations.length` 當總筆數顯示、`totalGivenCents` 只加總這 500 筆 —— 教會累積超過 500 筆之後，財務總額會**靜默算錯**，而畫面上沒有任何跡象。奉獻總額算錯是這個後台最不該出的錯。

在 `Church/server.ts` 的 `handleBootstrap` 中，owner 分支額外查一次彙總（整張表，不受 LIMIT 影響）：

```ts
      currentUser.role === 'owner'
        ? env.DB.prepare(
            `SELECT COUNT(*) AS total_count,
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN gross_cents ELSE 0 END), 0) AS completed_gross_cents
             FROM donations`,
          ).first<{ total_count: number; completed_gross_cents: number }>()
        : Promise.resolve(null),
```

把它加進 `Promise.all` 並解構為 `donationStatsRow`，然後：

```ts
    payload.donationStats = donationStatsRow
      ? { totalCount: donationStatsRow.total_count, completedGrossCents: donationStatsRow.completed_gross_cents }
      : { totalCount: 0, completedGrossCents: 0 };
```

在 `Church/data.ts` 加上型別：

```ts
export interface DonationStats {
  /** 全部奉獻筆數，不受列表的 500 筆上限影響 */
  totalCount: number;
  /** 已完成奉獻的實收總額（分） */
  completedGrossCents: number;
}
```

後台兩張統計卡改用 `donationStats.completedGrossCents` 與 `donationStats.totalCount`，不要再從 `donations` 陣列算。

另外，當 `donationStats.totalCount > donations.length` 時，在列表上方顯示一行提示，例如「僅顯示最近 500 筆，完整記錄請匯出 CSV」—— 使用者必須知道自己看到的是被截斷的清單。CSV 匯出（Step 8）本來就不受 500 筆限制。

- [ ] **Step 2: 確認 totalGivenCents 已就緒**

Task 8 已經把 `totalGiven` 改成 `totalGivenCents`（只計 `completed`，單位為分）並修好兩處顯示。先確認現況：

```bash
grep -n "totalGiven" Church/components/AdminDashboard.tsx
```

若已經是 `totalGivenCents` 的版本就跳過這一步。若不是（代表 Task 8 沒做完），照下面補上。

找到第 261 行附近：

```tsx
  const totalGiven = donations.reduce((sum, donation) => sum + donation.amount, 0);
```

替換為（`amount` 欄位已不存在；而且失敗與退款的奉獻不該計入總額）：

```tsx
  // 只計已完成的奉獻。把 pending/failed/refunded 算進總額會讓同工誤判實際收入。
  const totalGivenCents = donations
    .filter(donation => donation.status === 'completed')
    .reduce((sum, donation) => sum + donation.grossCents, 0);
```

- [ ] **Step 3: 更新兩處總額顯示**

第 409 行附近：

```tsx
          <div className="mt-2 text-3xl font-bold text-gray-900">${totalGiven.toLocaleString()}</div>
```

替換為：

```tsx
          <div className="mt-2 text-3xl font-bold text-gray-900">{formatDonationAmount(totalGivenCents)}</div>
```

第 760 行附近（`renderGiving` 內）：

```tsx
          <div className="mt-2 text-3xl font-bold text-gray-900">${totalGiven.toLocaleString()}</div>
```

替換為：

```tsx
          <div className="mt-2 text-3xl font-bold text-gray-900">{formatDonationAmount(totalGivenCents)}</div>
```

- [ ] **Step 4: 加篩選狀態**

在元件內 `const [showMailSettings, setShowMailSettings] = useState(false);`（約第 257 行）之後加入：

```tsx
  const [donationStatusFilter, setDonationStatusFilter] = useState('');
  const [donationCategoryFilter, setDonationCategoryFilter] = useState('');
```

在 Step 2 的 `totalGivenCents` 之後加入：

```tsx
  const visibleDonations = donations.filter(donation =>
    (!donationStatusFilter || donation.status === donationStatusFilter) &&
    (!donationCategoryFilter || donation.category === donationCategoryFilter)
  );

  // 分類清單從實際資料推導，不要硬寫。用途分類存在 settings 表就是為了讓同工
  // 自己增刪而不必改程式 —— 後台若硬寫一份，管理員改了分類後這裡就會悄悄過期。
  const donationCategoryOptions = Array.from(
    new Set(donations.map(donation => donation.category).filter((c): c is string => Boolean(c)))
  ).sort();
```

- [ ] **Step 5: 替換整個奉獻記錄表格**

在 `renderGiving` 中，把從 `<div className="overflow-hidden rounded-lg bg-white shadow-sm">` 到對應結束 `</div>` 的整個奉獻記錄區塊（約第 768–798 行）替換為：

```tsx
      <div className="overflow-hidden rounded-lg bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-gray-200 px-6 py-4">
          <h3 className="text-lg font-bold text-gray-800">{t('admin.donationRecords')}</h3>
          <select
            value={donationStatusFilter}
            onChange={e => setDonationStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">全部狀態</option>
            <option value="completed">已完成</option>
            <option value="pending">處理中</option>
            <option value="failed">失敗</option>
            <option value="refunded">已退款</option>
          </select>
          <select
            value={donationCategoryFilter}
            onChange={e => setDonationCategoryFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">全部用途</option>
            {donationCategoryOptions.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <a
            href="/api/admin/donations/export.csv"
            className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            匯出 CSV
          </a>
        </div>
        {visibleDonations.length === 0 ? (
          <div className="p-6 text-center text-gray-500">{t('admin.noDonations')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">{t('admin.tableDate')}</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">姓名</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">Email</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">用途</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">奉獻金額</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">代付手續費</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">總額</th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500">{t('admin.tableStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {visibleDonations.map(donation => (
                  <tr key={donation.id}>
                    <td className="px-4 py-4 text-sm text-gray-600">{formatDate(donation.createdAt, dateLocale)}</td>
                    <td className="px-4 py-4 text-sm text-gray-900">{donation.donorName || '—'}</td>
                    <td className="px-4 py-4 text-sm text-gray-600">{donation.donorEmail || '—'}</td>
                    <td className="px-4 py-4 text-sm text-gray-600">{donation.category || '—'}</td>
                    <td className="px-4 py-4 text-sm font-bold text-gray-900">{formatDonationAmount(donation.amountCents)}</td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      {donation.coveredFeeCents > 0 ? formatDonationAmount(donation.coveredFeeCents) : '—'}
                    </td>
                    <td className="px-4 py-4 text-sm font-bold text-gray-900">{formatDonationAmount(donation.grossCents)}</td>
                    <td className="px-4 py-4 text-sm">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${DONATION_STATUS_CLASS[donation.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {DONATION_STATUS_LABEL[donation.status] ?? donation.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
```

> 原本的狀態標籤寫死成綠色底（`bg-green-100`），因為舊 schema 只有 `completed` 一種狀態。現在四種狀態各有顏色 —— 失敗的奉獻顯示成綠色會誤導同工。

- [ ] **Step 6: 型別檢查**

```bash
npm run typecheck
```

預期：PASS。若仍有 `donation.amount` 或 `donation.date` 的殘留引用，依錯誤訊息一併改為 `grossCents` / `createdAt`。

- [ ] **Step 7: Commit**

```bash
git add Church/components/AdminDashboard.tsx
git commit -m "feat(church): 管理後台奉獻列表與 CSV 匯出"
```

---

## Task 23: 端到端驗證

這一關需要 Stripe test key 與 Stripe CLI 都就緒。

- [ ] **Step 1: 全套自動測試**

```bash
npm run test
```

預期：全部通過，含 `giving/` 下的所有測試檔

```bash
npm run typecheck
```

預期：無錯誤

- [ ] **Step 2: 啟動本地環境**

三個終端機：

```bash
npm run build && npx wrangler dev --port 8787
```

```bash
stripe listen --forward-to http://127.0.0.1:8787/api/giving/webhook
```

```bash
npm run dev
```

- [ ] **Step 3: 驗收條件 1 — 成功奉獻**

在 http://localhost:5173/giving/ways-to-give 填入金額 100、用途「什一」、姓名、email，**不**勾代付手續費，用測試卡 `4242 4242 4242 4242`（到期日填任意未來日期、CVC 任意三碼、郵遞區號 `98027`）完成付款。

```bash
npx wrangler d1 execute bol-church --local --command "SELECT status, amount_cents, covered_fee_cents, gross_cents, category, donor_email FROM donations ORDER BY created_at DESC LIMIT 1;"
```

預期：`status = completed`、`amount_cents = 10000`、`covered_fee_cents = 0`、`gross_cents = 10000`、`category = 什一`

- [ ] **Step 4: 驗收條件 2 — 代付手續費金額正確**

重複一次，金額 100 但**勾選**代付手續費。送出前確認畫面顯示「實際扣款 $102.56」。

```bash
npx wrangler d1 execute bol-church --local --command "SELECT amount_cents, covered_fee_cents, gross_cents FROM donations ORDER BY created_at DESC LIMIT 1;"
```

預期：`amount_cents = 10000`、`covered_fee_cents = 256`、`gross_cents = 10256`

到 Stripe 後台 Test mode 的 Payments 頁，確認該筆交易金額為 $102.56、淨額（Net）為 $100.00。

- [ ] **Step 5: 驗收條件 3 — 失敗流程**

用必定被拒的測試卡 `4000 0000 0000 0002` 送出一筆。

預期：畫面顯示繁體中文「這張卡被發卡銀行拒絕了，請換一張卡或與您的銀行聯絡。」，且可重新嘗試

```bash
npx wrangler d1 execute bol-church --local --command "SELECT status, failure_message FROM donations ORDER BY created_at DESC LIMIT 1;"
```

預期：`status = failed`

- [ ] **Step 6: 驗收條件 4 — webhook 去重**

在 `stripe listen` 的終端機輸出中找到一筆成功的 `payment_intent.succeeded` 事件 id（`evt_...`），重送它：

```bash
stripe events resend evt_你剛剛找到的事件id
```

```bash
npx wrangler d1 execute bol-church --local --command "SELECT COUNT(*) AS n FROM donations WHERE stripe_payment_intent_id = 'pi_對應的intent_id';"
```

預期：`n = 1`（沒有產生第二筆），且奉獻者沒有收到第二封感謝信

- [ ] **Step 7: 驗收條件 5 — 收據信**

確認測試用的 email 信箱收到兩封：Stripe 的官方收據 + 繁體中文感謝信。感謝信中應含奉獻用途、金額明細與報稅說明。

> 若 `.dev.vars` 沒有設 `RESEND_API_KEY`，中文感謝信不會寄出（`sendResendEmail` 會回 `ok: false` 並記 log）。此為預期行為，正式環境已設定該 secret。

- [ ] **Step 8: 驗收條件 6 — 管理後台**

以 owner 帳號登入後台，確認奉獻列表顯示所有欄位、篩選可運作，點「匯出 CSV」下載的檔案在 Excel 中開啟無亂碼、欄位正確。

- [ ] **Step 9: 驗收條件 7、8 — 過渡畫面與假路由**

確認「定期」分頁顯示「即將推出」與聯絡資訊。

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:8787/api/donations \
  -H 'Content-Type: application/json' -d '{"amount":100,"type":"one-time"}'
```

預期：`404`（假路由已移除）

- [ ] **Step 10: Commit 驗證結果**

若上述任一步未通過，回到對應的 Task 修正後重跑。全數通過後：

```bash
git add -A
git commit -m "test(church): 線上奉獻端到端驗證通過"
```

---

## Task 24: 正式上線

**⚠️ 這一關會動到真錢。在使用者明確確認前不要執行。**

- [ ] **Step 1: 設定正式環境的 secrets**

```bash
npx wrangler secret put STRIPE_SECRET_KEY
```

貼上 Stripe 後台 **Live mode** 的 `sk_live_...`

- [ ] **Step 2: 在 Stripe 後台建立正式 webhook endpoint**

到 Stripe Dashboard（Live mode）→ Developers → Webhooks → Add endpoint：

- Endpoint URL：`https://www.bolccop.org/api/giving/webhook`
- 訂閱事件：`payment_intent.succeeded`、`payment_intent.payment_failed`、`charge.refunded`

建立後複製 Signing secret（`whsec_...`）：

```bash
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

- [ ] **Step 3: 確認帳號 statement descriptor**

到 Stripe Dashboard → Settings → Business → Public details，確認 statement descriptor 為 `BREAD OF LIFE CHURCH`。

- [ ] **Step 4: 換上 live publishable key**

修改 `Church/wrangler.toml`：

```toml
STRIPE_PUBLISHABLE_KEY = "pk_live_51UIxtnRrRVwtjfXrP2Wqd4und9tHI3chBN0rOCeMbUPQD2QutwIGxxasPnB2biBMdqeL6bqp20qHO2TOBvfseEXZ00stO4tKmu"
```

同時確認 `STRIPE_FEE_PERCENT` 與 Stripe 後台實際核准的非營利費率一致。

- [ ] **Step 5: 套用正式資料庫 migration**

**套用前先做兩件事，缺一不可。**

`CAST(ROUND(amount * 100) AS INTEGER)` 對所有合法的兩位小數金額都精確（已窮舉 $0.01–$1000 共 10 萬個值驗證，零誤差），但對第三位小數剛好落在半分的值會少 1 分 —— `1.005` → 100、`8.165` → 816、`9.995` → 999。而舊的 `POST /api/donations` 是 `Number(payload.amount)`，從未驗證過小數位數，所以不能假設正式資料都是整分。

先掃出有問題的列：

```bash
npx wrangler d1 execute bol-church --remote --command "SELECT id, date, amount FROM donations WHERE ROUND(amount * 1000, 0) % 10 != 0;"
```

預期：**零列**。若有列出來，停下來逐筆判斷該進位到哪一分，不要直接套用。

再記下套用前的總計，作為事後比對的基準：

```bash
npx wrangler d1 execute bol-church --remote --command "SELECT COUNT(*) AS n, SUM(amount) AS total_dollars FROM donations;"
```

把這兩個數字抄下來。然後套用：

```bash
npx wrangler d1 migrations apply bol-church --remote
```

套用後比對：

```bash
npx wrangler d1 execute bol-church --remote --command "SELECT COUNT(*) AS n, SUM(amount_cents) AS total_cents FROM donations WHERE source = 'legacy';"
```

`n` 必須等於套用前的筆數，`total_cents` 必須等於套用前 `total_dollars × 100`（四捨五入到整數）。對不上就代表有列轉換錯了。

> **不要用 `amount_cents + covered_fee_cents != gross_cents` 當作轉換正確性的檢查。** 對 legacy 列它是恆真的 —— `covered_fee_cents` 寫死 0，而 `amount_cents` 與 `gross_cents` 是用同一個運算式算出來的，所以它永遠不會失敗。它只驗內部一致性，不驗轉換對不對。上面的筆數與總額比對才是真的檢查。

- [ ] **Step 6: 部署**

依 `CLAUDE.md` 記載，Church 部署需要教會的 Cloudflare 帳號憑證（`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID=953bb353...`），wrangler 的 OAuth session 屬於另一個個人帳號。

```bash
npm run deploy:prod
```

- [ ] **Step 7: 正式環境冒煙測試**

到 https://www.bolccop.org/giving/ways-to-give 用**真實卡片**奉獻 $1（下限），確認：
- 付款成功
- 收到 Stripe 收據與中文感謝信
- 管理後台出現該筆記錄
- Stripe 後台 Payments 顯示該筆交易

隨後在 Stripe 後台把這筆 $1 退款，驗證 `charge.refunded` webhook 把記錄轉為 `refunded`。

- [ ] **Step 8: Commit**

```bash
git add Church/wrangler.toml
git commit -m "chore(church): 線上奉獻切換至 Stripe live 金鑰"
```

---

## 附錄：Stripe 測試卡號

| 卡號 | 行為 |
|---|---|
| `4242 4242 4242 4242` | 成功 |
| `4000 0000 0000 0002` | 被拒（generic decline） |
| `4000 0000 0000 9995` | 餘額不足 |
| `4000 0025 0000 3155` | 需要 3D Secure 驗證 |
| `4000 0000 0000 0069` | 卡片過期 |

到期日填任意未來日期，CVC 任意三碼，郵遞區號填 `98027`。
