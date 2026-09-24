-- BOLCCOP Meeting Client downloads (the server also creates this on first use).
CREATE TABLE IF NOT EXISTS desktop_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  file TEXT NOT NULL,
  version TEXT,
  kind TEXT NOT NULL,
  country TEXT
);
CREATE INDEX IF NOT EXISTS idx_desktop_downloads_created ON desktop_downloads(created_at);
