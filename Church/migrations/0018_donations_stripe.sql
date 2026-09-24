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
