-- 0020: users.role 的 CHECK 約束加入 counter（點款人員）
-- SQLite 無法直接修改 CHECK，沿用 0007 的重建手法。
--
-- 注意：0019 讓 offerings.created_by 以 ON DELETE SET NULL 參照 users。
-- 若 foreign_keys 為 ON，下面的 DROP TABLE users 會觸發該動作、把所有
-- created_by 清成 NULL（Counter 會因此看不到自己記過的資料）。
-- 先把值備份起來，重建完再寫回；foreign_keys 為 OFF 時這幾步是無害的 no-op。

CREATE TABLE _offering_creator_backup AS
SELECT id, created_by FROM offerings WHERE created_by IS NOT NULL;

CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'finance_admin', 'auditor', 'dev', 'counter')),
  member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO users_new (id, name, email, role, member_id, password_hash, active, created_at, updated_at)
SELECT id, name, email, role, member_id, password_hash, active, created_at, updated_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

UPDATE offerings
SET created_by = (SELECT b.created_by FROM _offering_creator_backup b WHERE b.id = offerings.id)
WHERE id IN (SELECT id FROM _offering_creator_backup);

DROP TABLE _offering_creator_backup;
