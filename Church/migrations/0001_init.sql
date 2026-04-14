CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sermons (
  id TEXT PRIMARY KEY,
  title_en TEXT NOT NULL,
  title_zh TEXT NOT NULL,
  speaker_en TEXT NOT NULL,
  speaker_zh TEXT NOT NULL,
  date TEXT NOT NULL,
  series_en TEXT NOT NULL,
  series_zh TEXT NOT NULL,
  passage_en TEXT NOT NULL,
  passage_zh TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  image_url TEXT,
  type TEXT NOT NULL CHECK (type IN ('sermon', 'daily-manna')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sermons_date ON sermons(date DESC);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date DESC);

CREATE TABLE IF NOT EXISTS prayer_requests (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('new', 'prayed'))
);

CREATE INDEX IF NOT EXISTS idx_prayer_requests_date ON prayer_requests(date DESC);

CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  amount REAL NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('one-time', 'recurring')),
  status TEXT NOT NULL CHECK (status IN ('completed'))
);

CREATE INDEX IF NOT EXISTS idx_donations_date ON donations(date DESC);
