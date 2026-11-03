-- Saved setups (scenes and their sources), per account, for the web editor's Templates.
CREATE TABLE IF NOT EXISTS templates (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
