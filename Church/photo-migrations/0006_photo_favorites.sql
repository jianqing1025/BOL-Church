ALTER TABLE photos ADD COLUMN favorite_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS photo_favorites (
  photo_id TEXT NOT NULL,
  user_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (photo_id, user_key)
);

CREATE INDEX IF NOT EXISTS idx_photo_favorites_user
  ON photo_favorites(user_key, created_at DESC);
