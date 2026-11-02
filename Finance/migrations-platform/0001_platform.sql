-- 多教會版的平台資料庫：誰是誰、屬於哪間教會、付了沒有。
-- 不放任何奉獻、成員或支出資料——那些在每間教會自己的資料庫裡（ChurchStore）。

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  -- 改密碼、刪帳戶時加一，舊的登入全部失效
  token_version INTEGER NOT NULL DEFAULT 0,
  last_church_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Email 驗證碼與重設密碼碼：只存雜湊，限次數、限時間
CREATE TABLE IF NOT EXISTS email_codes (
  email TEXT NOT NULL COLLATE NOCASE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'reset')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (email, purpose)
);

CREATE TABLE IF NOT EXISTS churches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- 教會人數：建立的人手動填寫，超過 100 人需訂閱專業版
  declared_size INTEGER NOT NULL CHECK (declared_size > 0),
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  currency TEXT NOT NULL DEFAULT 'USD',
  created_by TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS church_users (
  church_id TEXT NOT NULL REFERENCES churches(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'finance_admin', 'auditor', 'counter')),
  member_id TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (church_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_church_users_account ON church_users(account_id);

-- 訂閱狀態（App Store / Stripe，經 RevenueCat 回報）
CREATE TABLE IF NOT EXISTS entitlements (
  church_id TEXT PRIMARY KEY REFERENCES churches(id),
  source TEXT NOT NULL,
  product TEXT NOT NULL,
  status TEXT NOT NULL,
  expires_at TEXT,
  original_transaction_id TEXT,
  updated_at TEXT NOT NULL
);

-- 支持開發者的奉獻紀錄
CREATE TABLE IF NOT EXISTS support_gifts (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id),
  church_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  source TEXT NOT NULL,
  external_id TEXT UNIQUE,
  created_at TEXT NOT NULL
);
