-- 0007: 為 sermons 與 daily_manna 加 hidden 標記
-- 隱藏的條目在後台仍可見（用於管理），但不出現在公開頁面
ALTER TABLE sermons ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_manna ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
