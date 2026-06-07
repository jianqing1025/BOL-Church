-- 0010: 扩展支出工作流 —— 待审核 → 已批准 → 已开票 → 已入账（+ 已拒绝）
-- 新增 approved_at / invoiced_by / invoiced_at / accounted_by / accounted_at；
-- status CHECK 加入 'invoiced' 与 'accounted' 两个值。
-- SQLite 不能直接 ALTER CHECK，所以重建 expenses 表（沿用 0007 重建 users 的方式）。

PRAGMA foreign_keys=OFF;

CREATE TABLE expenses_new (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES expense_categories(id) ON DELETE SET NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  paid_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  approved_at TEXT,
  invoiced_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  invoiced_at TEXT,
  accounted_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  accounted_at TEXT,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'invoiced', 'accounted', 'rejected')),
  notes TEXT DEFAULT '',
  receipt_url TEXT,
  is_test INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO expenses_new (
  id, category_id, amount, date, description, paid_by, approved_by, approved_at,
  invoiced_by, invoiced_at, accounted_by, accounted_at,
  payment_method, status, notes, receipt_url, is_test, created_at, updated_at
)
SELECT
  id, category_id, amount, date, description, paid_by, approved_by,
  CASE WHEN status = 'approved' OR status = 'invoiced' OR status = 'accounted'
       THEN updated_at ELSE NULL END AS approved_at,
  NULL, NULL, NULL, NULL,
  payment_method, status, COALESCE(notes, ''), receipt_url, is_test, created_at, updated_at
FROM expenses;

DROP TABLE expenses;
ALTER TABLE expenses_new RENAME TO expenses;

PRAGMA foreign_keys=ON;
