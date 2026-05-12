PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS member_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  import_pid TEXT UNIQUE,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  partner TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  home_phone TEXT,
  group_id TEXT REFERENCES member_groups(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'visitor')),
  join_date TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state_region TEXT,
  postal_code TEXT,
  notes TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  contact_confirmed INTEGER NOT NULL DEFAULT 0,
  external_contact INTEGER NOT NULL DEFAULT 0,
  import_source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_members_import_pid ON members(import_pid);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_group ON members(group_id);
CREATE INDEX IF NOT EXISTS idx_members_name ON members(name);

CREATE TABLE IF NOT EXISTS member_contacts (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  phone TEXT,
  email TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'finance_admin', 'auditor', 'member')),
  member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS offering_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'gift',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offering_methods (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offerings (
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
);

CREATE INDEX IF NOT EXISTS idx_offerings_date ON offerings(date);
CREATE INDEX IF NOT EXISTS idx_offerings_member ON offerings(member_id);
CREATE INDEX IF NOT EXISTS idx_offerings_category ON offerings(category_id);

CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  budget_monthly REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES expense_categories(id) ON DELETE SET NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  paid_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  approved_by TEXT REFERENCES members(id) ON DELETE SET NULL,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  receipt_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

CREATE TABLE IF NOT EXISTS expense_summary (
  id TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,
  category_id TEXT REFERENCES expense_categories(id) ON DELETE CASCADE,
  budget_amount REAL NOT NULL DEFAULT 0,
  actual_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(year_month, category_id)
);

INSERT OR IGNORE INTO member_groups (id, name, description, created_at) VALUES
  ('group-core', '核心同工', '財務與行政核心同工', '2026-05-01T00:00:00.000Z'),
  ('group-family', '家庭小組', '家庭與社區牧養小組', '2026-05-01T00:00:00.000Z'),
  ('group-youth', '青年小組', '青年與學生團契', '2026-05-01T00:00:00.000Z');

INSERT OR IGNORE INTO members (id, name, email, phone, group_id, status, join_date, notes, created_at, updated_at) VALUES
  ('member-admin', 'Finance Admin', 'BOLCCOP@Gmail.com', '425-000-1000', 'group-core', 'active', '2024-01-07', '系統預設財務管理員', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('member-lin', '林恩典', 'grace.lin@example.com', '425-000-1001', 'group-family', 'active', '2024-06-02', '', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('member-chen', '陳以撒', 'isaac.chen@example.com', '425-000-1002', 'group-youth', 'active', '2025-09-14', '', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z'),
  ('member-visitor', '訪客家庭', NULL, NULL, NULL, 'visitor', '2026-05-03', '匿名/訪客記錄使用', '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

INSERT OR IGNORE INTO users (id, name, email, role, member_id, password_hash, active, created_at, updated_at) VALUES
  ('user-admin', 'Finance Admin', 'BOLCCOP@Gmail.com', 'super_admin', 'member-admin', 'Bolccop110550', 1, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

INSERT OR IGNORE INTO offering_categories (id, name, description, icon, created_at) VALUES
  ('offering-sunday', '主日崇拜', '主日聚會奉獻', 'church', '2026-05-01T00:00:00.000Z'),
  ('offering-prayer', '祈禱會', '祈禱會奉獻', 'hands', '2026-05-01T00:00:00.000Z'),
  ('offering-special', '特殊奉獻', '宣教、建堂與指定奉獻', 'sparkles', '2026-05-01T00:00:00.000Z');

INSERT OR IGNORE INTO offering_methods (id, name, created_at) VALUES
  ('method-cash', '現金', '2026-05-01T00:00:00.000Z'),
  ('method-transfer', '轉帳', '2026-05-01T00:00:00.000Z'),
  ('method-check', '支票', '2026-05-01T00:00:00.000Z'),
  ('method-online', '線上奉獻', '2026-05-01T00:00:00.000Z');

INSERT OR IGNORE INTO expense_categories (id, name, budget_monthly, description, created_at) VALUES
  ('expense-rent', '場地租金', 4200, '聚會場地與設施費用', '2026-05-01T00:00:00.000Z'),
  ('expense-ministry', '事工活動', 1800, '兒童、青年、小組與外展活動', '2026-05-01T00:00:00.000Z'),
  ('expense-admin', '行政用品', 650, '辦公、印刷與軟體工具', '2026-05-01T00:00:00.000Z');

INSERT OR IGNORE INTO offerings (id, member_id, amount, date, category_id, method_id, notes, created_at, updated_at) VALUES
  ('offering-001', 'member-lin', 500, '2026-05-03', 'offering-sunday', 'method-online', '五月第一週', '2026-05-03T18:00:00.000Z', '2026-05-03T18:00:00.000Z'),
  ('offering-002', 'member-chen', 180, '2026-05-03', 'offering-sunday', 'method-cash', '', '2026-05-03T18:10:00.000Z', '2026-05-03T18:10:00.000Z'),
  ('offering-003', NULL, 260, '2026-05-10', 'offering-special', 'method-check', '匿名宣教奉獻', '2026-05-10T18:20:00.000Z', '2026-05-10T18:20:00.000Z');

INSERT OR IGNORE INTO expenses (id, category_id, amount, date, description, paid_by, approved_by, payment_method, status, created_at, updated_at) VALUES
  ('expense-001', 'expense-rent', 4200, '2026-05-01', '五月場地租金', 'member-admin', 'member-admin', '銀行轉帳', 'approved', '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z'),
  ('expense-002', 'expense-ministry', 320, '2026-05-08', '兒童主日材料', 'member-lin', NULL, '信用卡', 'pending', '2026-05-08T10:00:00.000Z', '2026-05-08T10:00:00.000Z');
