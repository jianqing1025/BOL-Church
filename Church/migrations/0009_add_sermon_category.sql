-- 把 sermons 表細分為 4 個 category：
--   sunday-worship  主日信息（默認）
--   worship-praise  敬拜讚美
--   healing-prayer  醫治禱告
--   testimony       見證分享
-- daily_manna 表保持不變（仍然獨立）。

ALTER TABLE sermons ADD COLUMN category TEXT NOT NULL DEFAULT 'sunday-worship';

-- 按標題啟發式自動歸類現有行（只在 category 還是默認的 sunday-worship 時生效，避免覆蓋人工調整）

-- worship-praise: 敬拜 / 讚美 / 赞美 / praise / worship / 詩歌 / 诗歌 / hymn
UPDATE sermons SET category = 'worship-praise'
WHERE category = 'sunday-worship'
  AND (
    title_zh LIKE '%敬拜%'
    OR title_zh LIKE '%讚美%'
    OR title_zh LIKE '%赞美%'
    OR title_zh LIKE '%詩歌%'
    OR title_zh LIKE '%诗歌%'
    OR LOWER(title_en) LIKE '%praise%'
    OR LOWER(title_en) LIKE '%worship%'
    OR LOWER(title_en) LIKE '%hymn%'
  );

-- healing-prayer: 醫治 / 医治 / 禱告會 / 祷告会 / healing / prayer meeting
UPDATE sermons SET category = 'healing-prayer'
WHERE category = 'sunday-worship'
  AND (
    title_zh LIKE '%醫治%'
    OR title_zh LIKE '%医治%'
    OR title_zh LIKE '%禱告會%'
    OR title_zh LIKE '%祷告会%'
    OR LOWER(title_en) LIKE '%healing%'
    OR LOWER(title_en) LIKE '%prayer meeting%'
  );

-- testimony: 見證 / 见证 / testimony
UPDATE sermons SET category = 'testimony'
WHERE category = 'sunday-worship'
  AND (
    title_zh LIKE '%見證%'
    OR title_zh LIKE '%见证%'
    OR LOWER(title_en) LIKE '%testimony%'
  );

CREATE INDEX IF NOT EXISTS idx_sermons_category ON sermons(category);
