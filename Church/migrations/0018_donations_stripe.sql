-- 重建 donations 表以支援 Stripe 線上奉獻。
--
-- 舊表有兩個擋路的問題：
--   1. status CHECK (status IN ('completed')) —— 只允許單一值，放不下 pending/failed/refunded
--   2. amount REAL —— 金額用浮點數，累加會有誤差，報稅金額不能這樣存
-- SQLite 無法 ALTER TABLE 移除 CHECK，只能重建。

PRAGMA foreign_keys = OFF;

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

  type                      TEXT NOT NULL DEFAULT 'one-time',
  status                    TEXT NOT NULL,
  source                    TEXT NOT NULL DEFAULT 'stripe',

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

DROP TABLE donations;
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

PRAGMA foreign_keys = ON;
