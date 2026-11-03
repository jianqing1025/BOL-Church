-- OBS Church account sync
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- One content document per account, with a revision number for safe concurrent saves.
CREATE TABLE IF NOT EXISTS content (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  rev INTEGER NOT NULL,
  content TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
