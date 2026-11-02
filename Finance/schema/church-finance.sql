PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE member_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  group_id TEXT REFERENCES member_groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'visitor')),
  join_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, import_pid TEXT, first_name TEXT, last_name TEXT, partner TEXT, home_phone TEXT, address TEXT, city TEXT, state_region TEXT, postal_code TEXT, contact_confirmed INTEGER NOT NULL DEFAULT 0, external_contact INTEGER NOT NULL DEFAULT 0, import_source TEXT, starred INTEGER NOT NULL DEFAULT 0, is_test INTEGER NOT NULL DEFAULT 0);
CREATE TABLE member_contacts (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  phone TEXT,
  email TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE offering_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'gift',
  created_at TEXT NOT NULL
);
CREATE TABLE offering_methods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
, group_name TEXT NOT NULL DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0);
CREATE TABLE offerings (
  id TEXT PRIMARY KEY,
  member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  date TEXT NOT NULL,
  category_id TEXT REFERENCES offering_categories(id) ON DELETE SET NULL,
  method_id TEXT REFERENCES offering_methods(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  receipt_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
, is_test INTEGER NOT NULL DEFAULT 0, created_by TEXT REFERENCES users(id) ON DELETE SET NULL, receipt_urls TEXT);
CREATE TABLE expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  budget_monthly REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
, short_name TEXT NOT NULL DEFAULT '');
CREATE TABLE expense_summary (
  id TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,
  category_id TEXT REFERENCES expense_categories(id) ON DELETE CASCADE,
  budget_amount REAL NOT NULL DEFAULT 0,
  actual_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(year_month, category_id)
);
CREATE TABLE audit_logs (id TEXT PRIMARY KEY, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, entity_summary TEXT, reason TEXT NOT NULL, user_id TEXT, user_name TEXT, created_at TEXT NOT NULL, before_json TEXT, after_json TEXT);
CREATE TABLE app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_by TEXT,
      updated_at TEXT NOT NULL
    );
CREATE TABLE password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
CREATE TABLE IF NOT EXISTS "expenses" (
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
, approved_by_text TEXT, invoiced_by_text TEXT, accounted_by_text TEXT, invoice_note TEXT, invoice_amount REAL, invoice_receipt_url TEXT, account_receipt_url TEXT, receipt_urls TEXT, invoice_receipt_urls TEXT, account_receipt_urls TEXT);
CREATE TABLE expense_action_tokens (
  token_hash TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "users" (
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
CREATE TABLE upload_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL DEFAULT 'receipt',
  expires_at TEXT NOT NULL,
  closed_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE upload_session_files (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE reconciliations (
  id TEXT PRIMARY KEY,
  period_type TEXT NOT NULL CHECK (period_type IN ('month', 'year')),
  
  period TEXT NOT NULL,
  deposit_amount REAL,
  notes TEXT NOT NULL DEFAULT '',
  receipt_urls TEXT,
  is_test INTEGER NOT NULL DEFAULT 0,
  updated_by TEXT,
  updated_by_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deposit_date TEXT, deposits TEXT,
  UNIQUE (period_type, period, is_test)
);
DELETE FROM sqlite_sequence;
CREATE INDEX idx_members_status ON members(status);
CREATE INDEX idx_members_group ON members(group_id);
CREATE INDEX idx_members_name ON members(name);
CREATE INDEX idx_offerings_date ON offerings(date);
CREATE INDEX idx_offerings_member ON offerings(member_id);
CREATE INDEX idx_offerings_category ON offerings(category_id);
CREATE UNIQUE INDEX idx_members_import_pid ON members(import_pid);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX idx_password_resets_token ON password_resets(token_hash);
CREATE INDEX idx_password_resets_user ON password_resets(user_id);
CREATE INDEX idx_expense_action_tokens_expense ON expense_action_tokens(expense_id);
CREATE INDEX idx_offerings_created_by ON offerings(created_by);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_upload_sessions_expires ON upload_sessions(expires_at);
CREATE INDEX idx_upload_session_files_session ON upload_session_files(session_id);
