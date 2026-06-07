CREATE TABLE IF NOT EXISTS live_stream_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  channel_id TEXT,
  api_key TEXT,
  service_day INTEGER NOT NULL DEFAULT 0,
  service_start_local TEXT NOT NULL DEFAULT '10:00',
  service_duration_minutes INTEGER NOT NULL DEFAULT 90,
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  manual_video_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS live_stream_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  is_live INTEGER NOT NULL DEFAULT 0,
  video_id TEXT,
  started_at INTEGER,
  checked_at INTEGER NOT NULL,
  last_error TEXT
);

INSERT OR IGNORE INTO live_stream_config (id, updated_at) VALUES (1, 0);
INSERT OR IGNORE INTO live_stream_state (id, checked_at) VALUES (1, 0);
