-- 0014: 元数据轮转刷新游标
-- 记录每行上次刷新 YouTube 元数据(时长/播放数)的时间,定时任务按"最久未刷新"轮转更新。
-- NULL = 从未刷新,排序时最先被刷。

ALTER TABLE sermons ADD COLUMN meta_refreshed_at INTEGER;
ALTER TABLE daily_manna ADD COLUMN meta_refreshed_at INTEGER;
