-- keyset 分頁：date 會重複（同一天多堂），游標必須是 (date, id)，索引也要跟著複合。
-- 既有的 idx_sermons_date 只有 date，WHERE type = ? 仍會多掃。
CREATE INDEX IF NOT EXISTS idx_sermons_type_date_id ON sermons(type, date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_daily_manna_date_id ON daily_manna(date DESC, id DESC);

-- 每小時的 refreshOldestMetadata 用 ORDER BY meta_refreshed_at ASC LIMIT 100，
-- 目前沒有索引，等於每小時把兩張表全掃一遍（4,400 列）。
CREATE INDEX IF NOT EXISTS idx_sermons_meta_refreshed ON sermons(meta_refreshed_at);
CREATE INDEX IF NOT EXISTS idx_daily_manna_meta_refreshed ON daily_manna(meta_refreshed_at);
