-- 0006: 主日直播自建聊天 + 在线人数
-- 在线观众心跳表 + 聊天消息表 + YouTube 同时观看数缓存

CREATE TABLE IF NOT EXISTS live_viewers (
  session_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  guest_number INTEGER,
  last_ping_at INTEGER NOT NULL,
  video_id TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_live_viewers_video_ping ON live_viewers(video_id, last_ping_at);

CREATE TABLE IF NOT EXISTS live_chat_messages (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  ip_hash TEXT,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_chat_video_time ON live_chat_messages(video_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_ip_hash_time ON live_chat_messages(ip_hash, created_at);

ALTER TABLE live_stream_state ADD COLUMN youtube_viewers INTEGER;
