-- Sender geolocation for contact inbox + prayer requests, and saved email replies.
ALTER TABLE messages ADD COLUMN country TEXT;
ALTER TABLE messages ADD COLUMN region TEXT;
ALTER TABLE messages ADD COLUMN city TEXT;
ALTER TABLE prayer_requests ADD COLUMN country TEXT;
ALTER TABLE prayer_requests ADD COLUMN region TEXT;
ALTER TABLE prayer_requests ADD COLUMN city TEXT;

CREATE TABLE IF NOT EXISTS mailbox_replies (
  id TEXT PRIMARY KEY,
  parent_type TEXT NOT NULL,   -- 'message' | 'prayer'
  parent_id TEXT NOT NULL,
  body TEXT NOT NULL,
  to_email TEXT NOT NULL,
  sent_by TEXT,
  status TEXT NOT NULL,        -- 'sent' | 'failed'
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mailbox_replies_parent ON mailbox_replies (parent_type, parent_id);
