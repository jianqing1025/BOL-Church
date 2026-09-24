# Stripe 線上奉獻 — 第一期設計（一次性奉獻）

- 日期：2026-09-23
- 專案：Church（`bol-church` Worker）
- 狀態：設計已確認，待實作

## 1. 背景

奉獻頁 `/giving/ways-to-give` 目前掛著一個**假表單**。`GivingForm`（`Church/components/GivingPage.tsx`）按下「奉獻」後只呼叫 `submitDonation`，往 D1 的 `donations` 表寫一筆 `{amount, type, status:'completed'}`（`Church/server.ts` 的 `POST /api/donations`），接著顯示寫死的英文 "Thank You! ... A confirmation email has been sent."

沒有任何金流，也沒有寄出任何信。這個表單**正掛在正式站上**，會誤導奉獻者以為自己已經完成奉獻。止血是第一期的首要目的。

真正能收款的管道目前只有「其他奉獻方式」頁的 PayPal 連結、Zelle、郵寄支票與電匯。

教會已申請 Stripe 帳號，適用美國非營利費率。

## 2. 路線圖與本期範圍

完整需求橫跨五個可獨立運作的子系統，切成三期，每期各自可上線：

| 期別 | 內容 | 本文件 |
|---|---|---|
| 第一期 | 一次性奉獻全套：Payment Element、PaymentIntent、webhook、資料落地、收據信、管理後台檢視、CSV 匯出 | ✅ |
| 第二期 | 定期奉獻（Stripe Subscriptions）+ Customer Portal 自助管理 | 另立 spec |
| 第三期 | 與 Finance 系統自動對帳 | 另立 spec |

### 本期範圍

- 站內嵌入 Stripe Payment Element 的一次性奉獻
- 表單欄位：金額、用途分類、姓名、Email、是否代付手續費、留言／代禱事項
- 後端建立 PaymentIntent、驗證 webhook、寫入奉獻記錄
- 收據與感謝信
- 管理後台檢視奉獻記錄 + 匯出 CSV

### 明確不在本期範圍

- 定期奉獻。UI 上的「一次性／定期」切換本期改為：「定期」分頁顯示「即將推出，如需設定定期奉獻請聯絡教會」並附現有電話與 email。不做半套的訂閱流程。
- 與 Finance 系統的自動對帳。第三期之前，同工以本期的 CSV 匯出手動匯入。
- 會友帳號與登入。網站目前的 `users` 表只有 `owner` / `contributor` 兩種管理員角色（`Church/migrations/0004_admin_users.sql`），奉獻者一律視為匿名訪客。
- 退款流程。退款一律在 Stripe 後台操作，本期僅透過 webhook 被動接收 `charge.refunded` 並更新狀態。

## 3. 信任邊界

這是本期最關鍵的設計約束，其餘設計都從這裡推出。

### 3.1 金額由伺服器決定

前端只送三項：奉獻本金、用途分類、是否代付手續費。手續費與實刷總額**一律由 Worker 計算**，前端送來的任何總額欄位都忽略。

否則有人可以改 request 用 $1 換一張 $500 的報稅收據。

### 3.2 只有 webhook 能標記完成

前端 Stripe.js 回報 `succeeded` 只用來切換畫面，**絕不作為寫入 `completed` 的依據**。原因有二：前端回報可被偽造；付款成功但瀏覽器當掉／關閉的情況真實存在，此時只有 webhook 會到。

奉獻記錄的狀態轉移只發生在 webhook handler 內。

### 3.3 Webhook 必須驗簽且必須去重

Stripe webhook 保證 at-least-once 送達，同一事件會重送。以 `stripe_payment_intent_id` 的 UNIQUE 約束作為去重依據。簽章一律用 `STRIPE_WEBHOOK_SECRET` 驗證，驗不過直接 400，不做任何寫入。

## 4. 資料模型

### 4.1 現有表的問題

現有 `donations` 表（`Church/migrations/0001_init.sql`）有兩個擋路的問題：

- `status TEXT NOT NULL CHECK (status IN ('completed'))` — 只允許單一值，放不下 `pending` / `failed` / `refunded`
- `amount REAL` — 金額用浮點數。累加與比對會出現 `0.1 + 0.2 != 0.3` 這類誤差，報稅金額不能這樣存

SQLite 無法 `ALTER TABLE` 移除 CHECK 約束，因此需要重建表。

### 4.2 Migration 策略

新增 migration，採 SQLite 標準的 12 步重建流程：建新表 → `INSERT INTO ... SELECT` 搬舊資料 → `DROP` 舊表 → `RENAME`。

舊資料的 `amount`（REAL，單位元）轉為 `amount_cents`（INTEGER，單位分）時用 `CAST(ROUND(amount * 100) AS INTEGER)`。舊資料沒有姓名、email、用途，這些欄位留 NULL；`source` 標為 `legacy`，與 Stripe 進來的記錄區分開。

### 4.3 新結構

```sql
CREATE TABLE donations (
  id                        TEXT PRIMARY KEY,
  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,

  donor_name                TEXT,
  donor_email               TEXT,
  category                  TEXT,          -- 什一/感恩/建堂/宣教/愛心
  note                      TEXT,          -- 留言／代禱事項

  amount_cents              INTEGER NOT NULL,   -- 奉獻本金
  covered_fee_cents         INTEGER NOT NULL DEFAULT 0,  -- 自願加付的手續費
  gross_cents               INTEGER NOT NULL,   -- 實際刷卡總額
  currency                  TEXT NOT NULL DEFAULT 'usd',

  type                      TEXT NOT NULL,   -- one-time（第二期加 recurring）
  status                    TEXT NOT NULL,   -- pending/completed/failed/refunded
  source                    TEXT NOT NULL,   -- stripe / legacy / manual

  stripe_payment_intent_id  TEXT UNIQUE,
  receipt_url               TEXT,
  failure_message           TEXT
);

CREATE INDEX idx_donations_created ON donations(created_at DESC);
CREATE INDEX idx_donations_status  ON donations(status);
CREATE INDEX idx_donations_email   ON donations(donor_email);
```

`gross_cents = amount_cents + covered_fee_cents`，恆等式在寫入時由伺服器保證。

金額一律以**分**為單位的整數儲存與運算，避免浮點誤差。

### 4.4 用途分類

五類：什一、感恩、建堂、宣教、愛心。

存進 `settings` 表而非寫死在程式裡，讓同工日後在管理後台增刪。程式端有一份預設值作為 fallback，`settings` 讀不到時使用。

## 5. 手續費計算

Stripe 美國非營利費率為 **2.2% + $0.30**（實際費率以 Stripe 後台核准結果為準，因此寫成設定值 `STRIPE_FEE_PERCENT` / `STRIPE_FEE_FIXED_CENTS`，不寫死）。

要讓教會**實收等於奉獻本金**，加價公式是：

```
gross = (amount + fixed) / (1 - rate)
```

不是 `amount × (1 + rate)`。後者會少收，因為手續費是對總額收取的。

以整數分實作，總額向上取整到分：

```
gross_cents = ceil((amount_cents + fixed_cents) / (1 - rate))
covered_fee_cents = gross_cents - amount_cents
```

驗算（$100 奉獻，2.2% + $0.30）：

```
gross_cents = ceil((10000 + 30) / 0.978) = ceil(10255.62) = 10256   → $102.56
實際手續費   = 10256 × 0.022 + 30 = 255.63 → $2.56
教會實收     = 102.56 - 2.56 = $100.00 ✅
```

使用者不勾選代付時，`covered_fee_cents = 0`、`gross_cents = amount_cents`，手續費由教會吸收。

表單上要即時顯示實刷金額，不能只寫「我願意代付手續費」而不講數字。

### 報稅金額

代付的手續費部分在美國稅法上同屬可抵扣的慈善捐贈，因此年度報稅收據上的金額用 `gross_cents`。這點在收據信中會明確寫出「您的奉獻總額 $102.56，其中 $2.56 用於支付交易手續費」，避免奉獻者對帳時困惑。

## 6. API

| 路由 | 方法 | 說明 |
|---|---|---|
| `/api/giving/config` | GET | 回傳 publishable key、用途分類清單、手續費率、幣別。前端啟動時取用，避免把設定編死在 bundle |
| `/api/giving/intent` | POST | 驗證輸入 → 計算手續費 → 建立 PaymentIntent（帶 Idempotency-Key）→ 寫入 `pending` 記錄 → 回傳 `client_secret` 與本地 `donation_id` |
| `/api/giving/webhook` | POST | 驗簽 → 依事件型別更新記錄狀態 → 觸發感謝信 |
| `/api/giving/status/:id` | GET | 前端在「已付款但 webhook 未到」時輪詢。只回傳 `status`，不洩漏姓名、email 等個資 |

現有的 `POST /api/donations`（假表單用的）移除。`submitDonation` 從 `AdminContext` 與 `api.ts` 一併移除，`Church/components/Giving.tsx` 若已無其他用途則刪除。

### 6.1 `POST /api/giving/intent` 驗證規則

- 金額下限 $1.00、上限 $25,000。下限避免手續費比奉獻高的無意義交易；上限是防呆，超過請走電匯（頁面上已有電匯資訊）
- Email 需通過基本格式檢查，且為必填（收據與去重都需要）
- 姓名必填、去除前後空白後不得為空
- 用途分類必須在允許清單內
- 留言長度上限 1000 字，儲存前 escape
- 同一 IP 的速率限制：每分鐘最多 15 次建立請求，避免被當成卡號測試工具（carding）。
  上限刻意不訂太緊：小教會主日崇拜後常有一群人在共用的教會 wifi 或電信 CGNAT 後面
  同時奉獻，對外是同一個 IP。訂 5 的話第六個要奉獻的人會被擋死且毫無出路，而那是
  主日的常態流量。擋卡號測試的最後一道防線是 Stripe Radar，不是這裡

### 6.2 傳給 Stripe 的欄位

- `amount` = `gross_cents`
- `currency` = `usd`
- `receipt_email` = 奉獻者 email
- statement descriptor：在 Stripe 後台把**帳號層級**的 statement descriptor 設為 `BREAD OF LIFE CHURCH`（20 字元，上限 22），程式碼不逐筆帶。逐筆設定只在需要區分不同業務線時才有必要，教會只有奉獻一種收款，帳號層級設一次最不容易出錯
- `metadata`：`donation_id`、`category`、`donor_name`、`amount_cents`、`covered_fee_cents`

metadata 帶齊是為了在 Stripe 後台就能查帳，不必兩邊對照。第三期匯入 Finance 時也會用到。

### 6.3 Webhook 處理的事件

| 事件 | 動作 |
|---|---|
| `payment_intent.succeeded` | 記錄轉 `completed`，寫入 `receipt_url`，觸發感謝信 |
| `payment_intent.payment_failed` | 記錄轉 `failed`，寫入 `failure_message` |
| `charge.refunded` | 記錄轉 `refunded` |

其餘事件回 200 忽略。

處理失敗時回 5xx 讓 Stripe 重試；因為有 UNIQUE 去重，重試是安全的。

## 7. 前端

### 7.1 元件拆分

`GivingPage.tsx` 目前 303 行，把表單、版面、分頁邏輯全混在一起。本期拆為：

```
components/giving/
  StripeGivingForm.tsx     -- 表單容器：欄位狀態、驗證、送出
  AmountSelector.tsx       -- 金額快捷鈕與自訂金額
  FeeCoverToggle.tsx       -- 代付手續費勾選 + 即時金額顯示
  GivingResult.tsx         -- 成功／失敗／處理中三種結果畫面
  useGivingConfig.ts       -- 取 /api/giving/config
```

`GivingPage.tsx` 只留分頁與版面。

### 7.2 相依套件

新增 `@stripe/stripe-js` 與 `@stripe/react-stripe-js`。

### 7.3 付款狀態機

```
編輯中 → 送出 → 建立 intent → 確認付款(含 3DS)
                                   ├─ 成功 → 輪詢狀態 → 完成
                                   ├─ 需要驗證 → Stripe 處理 → 回到上一步
                                   └─ 失敗 → 顯示錯誤，可重試（重用同一 intent）
```

「輪詢狀態」這一步是必要的：使用者付款成功的瞬間 webhook 可能還沒到，畫面要顯示「處理中」而非直接宣告完成。輪詢最多 10 秒，逾時後顯示「奉獻已送出，確認信稍後寄達」——此時付款其實已成功，只是尚未落地，不應嚇到使用者。

### 7.4 文案

全部走 `constants/translations.ts`，中文一律**繁體**。現有寫死的英文（"Thank You!"、"Please enter a valid amount."、"Other Amount"、"Give Again"）一併移除。

錯誤訊息要講人話。Stripe 回的 `card_declined` 對一般奉獻者沒有意義，要轉成「這張卡被發卡銀行拒絕了，請換一張卡或聯絡銀行」。

## 8. 收據與感謝信

兩封：

1. **Stripe 內建收據** — 設定 `receipt_email` 即可，Stripe 自動寄出，零維護，含官方交易憑證
2. **中文感謝信** — 走現有 Resend 整合（`RESEND_API_KEY` 已在 Church Worker 設定）。繁體中文，含奉獻金額明細、用途、報稅用語、教會聯絡方式

感謝信寄送失敗**不可**讓 webhook 回 5xx —— 錢已經收了，重試整個 webhook 只會造成混亂。寄信失敗記錄到 log，奉獻記錄照常標記完成。

## 9. 管理後台

在現有管理後台（`components/AdminDashboard.tsx`）的奉獻區塊：

- 列表顯示日期、姓名、Email、用途、本金、代付手續費、總額、狀態
- 依日期區間、狀態、用途篩選
- 「匯出 CSV」按鈕，欄位對齊 Finance 的 `Offering` 結構（日期、姓名、email、金額、用途），方便同工手動匯入，直到第三期自動對帳完成
- 僅 `owner` 角色可見（奉獻資料含個資）

## 10. 設定與機密

| 名稱 | 位置 | 說明 |
|---|---|---|
| `STRIPE_SECRET_KEY` | `wrangler secret put` | **絕不寫入檔案或 commit** |
| `STRIPE_WEBHOOK_SECRET` | `wrangler secret put` | 建立 webhook endpoint 後取得 |
| `STRIPE_PUBLISHABLE_KEY` | `wrangler.toml` `[vars]` | 設計上即為公開值，會編進前端 |
| `STRIPE_FEE_PERCENT` | `wrangler.toml` `[vars]` | 預設 `2.2` |
| `STRIPE_FEE_FIXED_CENTS` | `wrangler.toml` `[vars]` | 預設 `30` |

Live publishable key（已取得）：
`pk_live_51UIxtnRrRVwtjfXrP2Wqd4und9tHI3chBN0rOCeMbUPQD2QutwIGxxasPnB2biBMdqeL6bqp20qHO2TOBvfseEXZ00stO4tKmu`

開發與驗收全程使用 **Test mode**（`pk_test_` / `sk_test_`），以測試卡號 `4242 4242 4242 4242` 驗證流程，確認無誤後才切換到 live key 部署。**待取得 test publishable key。**

## 11. 測試

專案已有 vitest（`Church/vitest.config.ts`）。

必測項目：

- 手續費計算：一般值、進位邊界（如 $0.01、$1.00、$99.99）、不代付時 `covered_fee_cents = 0`
- `gross_cents = amount_cents + covered_fee_cents` 恆等式
- Webhook 簽章驗證：正確簽章通過、錯誤簽章 400、缺簽章 400、時間戳過期拒絕
- 重送去重：同一 `payment_intent_id` 兩次 `succeeded` 只產生一筆 `completed`
- 金額驗證：低於下限、高於上限、非數字、負數、NaN 皆拒絕
- 狀態轉移：`pending → completed`、`pending → failed`、`completed → refunded`
- Migration：舊 REAL 金額正確轉為整數分

## 12. 驗收條件

1. 在 Test mode 下以 `4242 4242 4242 4242` 完成一筆奉獻，D1 出現一筆 `completed` 記錄，金額與用途正確
2. 勾選代付手續費時，前端顯示的實刷金額與 Stripe 後台實際扣款一致，教會實收等於奉獻本金
3. 以測試卡 `4000 0000 0000 0002`（必定被拒）驗證失敗流程，畫面顯示中文錯誤訊息且可重試
4. 手動在 Stripe CLI 重送同一筆 `payment_intent.succeeded`，D1 仍只有一筆記錄
5. 奉獻者收到 Stripe 收據與繁體中文感謝信
6. 管理後台看得到記錄，CSV 匯出可開啟且欄位正確
7. 「定期」分頁顯示「即將推出」與教會聯絡方式，不再出現假的付款按鈕
8. 舊 `POST /api/donations` 假路由已移除
9. `npm run typecheck` 與 `npm run test` 全數通過

## 13. 待辦（阻擋實作）

- [ ] 取得 Stripe **test** publishable key 與 secret key
- [ ] 確認 Stripe 後台非營利費率已核准（影響 `STRIPE_FEE_PERCENT` 實際值）
- [ ] 在 Stripe 後台把帳號 statement descriptor 設為 `BREAD OF LIFE CHURCH`
- [ ] 在 Stripe 後台建立 webhook endpoint 指向 `https://www.bolccop.org/api/giving/webhook`，取得 `whsec_` 並以 `wrangler secret put` 設定
