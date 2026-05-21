-- 0007: 新增 dev 角色 + 測試數據標記（is_test）

-- 1) 測試數據標記欄位
ALTER TABLE members ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
ALTER TABLE offerings ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;

-- 2) 現有奉獻與支出記錄全部標記為測試數據
UPDATE offerings SET is_test = 1;
UPDATE expenses SET is_test = 1;

-- 3) 名稱含 "test" 的成員標記為測試用戶
UPDATE members SET is_test = 1
WHERE lower(name) LIKE '%test%'
   OR lower(coalesce(first_name, '')) LIKE '%test%'
   OR lower(coalesce(last_name, '')) LIKE '%test%';

-- 4) 重建 users 表：role 加入 dev、移除 member（現有 member → auditor）
CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'finance_admin', 'auditor', 'dev')),
  member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO users_new (id, name, email, role, member_id, password_hash, active, created_at, updated_at)
SELECT id, name, email,
       CASE role WHEN 'member' THEN 'auditor' ELSE role END,
       member_id, password_hash, active, created_at, updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
