CREATE TABLE IF NOT EXISTS daily_manna (
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_daily_manna_date ON daily_manna(date DESC);

INSERT OR IGNORE INTO daily_manna (
  id, title_en, title_zh, speaker_en, speaker_zh, date,
  series_en, series_zh, passage_en, passage_zh, youtube_id, image_url,
  created_at, updated_at
)
SELECT
  id, title_en, title_zh, speaker_en, speaker_zh, date,
  series_en, series_zh, passage_en, passage_zh, youtube_id, image_url,
  created_at, updated_at
FROM sermons
WHERE type = 'daily-manna';

DELETE FROM sermons
WHERE type = 'daily-manna';
