-- 多频道 YouTube 同步：每个频道独立的 channel_id + api_key
CREATE TABLE IF NOT EXISTS sync_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  api_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_channels_sort ON sync_channels(sort_order);
