-- 0022: 手機掃碼上傳。
-- 桌面建立一次性 session 並畫成 QR，手機掃碼後用該 session 的 token 免登入上傳，
-- 桌面輪詢取回結果。token 只存 hash，比照 password_resets / expense_action_tokens。
CREATE TABLE IF NOT EXISTS upload_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL DEFAULT 'receipt',
  expires_at TEXT NOT NULL,
  closed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_upload_sessions_expires ON upload_sessions(expires_at);

CREATE TABLE IF NOT EXISTS upload_session_files (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_upload_session_files_session ON upload_session_files(session_id);
