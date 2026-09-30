-- 對帳：每月／每年一筆，記錄銀行實際存入金額、備註與附件（對帳單照片）。
-- 奉獻筆數與金額由 offerings 即時計算，不在這裡重複保存。
CREATE TABLE IF NOT EXISTS reconciliations (
  id TEXT PRIMARY KEY,
  period_type TEXT NOT NULL CHECK (period_type IN ('month', 'year')),
  -- 'YYYY-MM' 或 'YYYY'
  period TEXT NOT NULL,
  deposit_amount REAL,
  notes TEXT NOT NULL DEFAULT '',
  receipt_urls TEXT,
  is_test INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_by_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (period_type, period, is_test)
);
