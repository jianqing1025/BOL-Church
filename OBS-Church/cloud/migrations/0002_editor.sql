-- Wrong passwords for the web editor, per address (for the lockout).
CREATE TABLE IF NOT EXISTS editor_failures (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS editor_failures_ip_at ON editor_failures (ip, at);
