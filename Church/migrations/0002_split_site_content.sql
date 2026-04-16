CREATE TABLE IF NOT EXISTS site_content (
  path TEXT PRIMARY KEY,
  en TEXT NOT NULL DEFAULT '',
  zh TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_site_content_updated_at ON site_content(updated_at DESC);
