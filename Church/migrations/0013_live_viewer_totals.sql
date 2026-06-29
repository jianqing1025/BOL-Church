-- 0013: 直播在线累计统计
--  - live_session_seen: 每场直播的 join 去重日志,用于"网站累计唯一人数"(主键对同一浏览器去重)
--  - live_stream_state.youtube_peak: 当前直播的 YouTube 并发峰值
--  - sermons.live_online_total: 归档当时的总在线人数快照(网站累计 + YouTube 峰值)

CREATE TABLE IF NOT EXISTS live_session_seen (
  video_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (video_id, session_id)
);

ALTER TABLE live_stream_state ADD COLUMN youtube_peak INTEGER;

ALTER TABLE sermons ADD COLUMN live_online_total INTEGER;
