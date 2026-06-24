-- 0008: 為 sermons 與 daily_manna 加上 duration_seconds（秒）與 view_count
-- 第一次部署後執行 admin「刷新元數據」按鈕一次性回填現有條目
ALTER TABLE sermons ADD COLUMN duration_seconds INTEGER;
ALTER TABLE sermons ADD COLUMN view_count INTEGER;
ALTER TABLE daily_manna ADD COLUMN duration_seconds INTEGER;
ALTER TABLE daily_manna ADD COLUMN view_count INTEGER;
