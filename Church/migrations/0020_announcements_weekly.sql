-- 公告欄與同工週報（spec: docs/superpowers/specs/2026-09-30-announcements-weekly-report-design.md）

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  event_date TEXT,
  show_until TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_announcements_show_until ON announcements(show_until);

CREATE TABLE IF NOT EXISTS weekly_reports (
  id TEXT PRIMARY KEY,
  week_of TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 週報初始密碼：只存 salt 與 sha256(salt:password) 的 base64，不放明文。管理者可在後台修改。
INSERT OR IGNORE INTO settings (key, value_json, updated_at)
VALUES ('weeklyPassword', '{"salt": "3f74bb86d0047da9b442cb9de35ebf5f", "hash": "+RlvqzU0mgAy6l33RaEI+Wdg2bLudqJrJLdInkri50Y="}', '2026-09-30T00:00:00.000Z');
