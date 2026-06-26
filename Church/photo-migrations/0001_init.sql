CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL,
  src TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  collection TEXT NOT NULL DEFAULT '',
  album TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER,
  width INTEGER,
  height INTEGER,
  uploader_id TEXT NOT NULL DEFAULT '',
  uploader_name TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_photos_visible_sort
  ON photos(hidden, sort_order DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_photos_collection_album
  ON photos(collection, album);
