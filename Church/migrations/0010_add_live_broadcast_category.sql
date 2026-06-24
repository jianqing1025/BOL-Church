-- 第 5 個 sermon category：live-broadcast（歷史直播）
-- 規則：標題含 "Live"（不區分大小寫）或 "直播" → 歸入 live-broadcast
-- 此規則優先級高，即使原本被分到其它 category，也搬過來。

UPDATE sermons SET category = 'live-broadcast'
WHERE category <> 'live-broadcast'
  AND (
    LOWER(title_en) LIKE '%live%'
    OR LOWER(title_zh) LIKE '%live%'
    OR title_zh LIKE '%直播%'
  );
