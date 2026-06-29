-- 0012: 去除同一 YouTube 影片被重複匯入的問題，並加上 youtube_id 唯一索引。
--
-- 背景：直播結束後，影片可能同時被「直播歸檔」(category=live-broadcast) 與
-- 「頻道 Uploads 每日同步」兩條路徑各插入一行（兩者都先查重再插入，且無唯一約束，
-- 周日兩個 cron 併發時會競態）。結果：同一 youtube_id 出現重複行；若只有同步那條
-- 存活，category 不是 live-broadcast，歷史直播區就看不到它。
--
-- 本遷移：先清掉重複行（每個 youtube_id 只留一行），再建唯一索引，從 DB 層杜絕重複。

-- ---- sermons 去重：每個 youtube_id 留一行 ----
-- 保留優先序：live-broadcast 分類優先 → 有時長/觀看數的（同步帶元數據）→ 最早建立的。
DELETE FROM sermons
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY youtube_id
        ORDER BY
          (category = 'live-broadcast') DESC,
          (duration_seconds IS NOT NULL) DESC,
          (view_count IS NOT NULL) DESC,
          created_at ASC,
          id ASC
      ) AS rn
    FROM sermons
  )
  WHERE rn > 1
);

-- ---- daily_manna 去重：每個 youtube_id 留一行 ----
-- daily_manna 無 category，優先序：有元數據的 → 最早建立的。
DELETE FROM daily_manna
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY youtube_id
        ORDER BY
          (duration_seconds IS NOT NULL) DESC,
          (view_count IS NOT NULL) DESC,
          created_at ASC,
          id ASC
      ) AS rn
    FROM daily_manna
  )
  WHERE rn > 1
);

-- ---- 唯一索引：之後重複插入會被 INSERT OR IGNORE 安全跳過 ----
CREATE UNIQUE INDEX IF NOT EXISTS idx_sermons_youtube_id ON sermons(youtube_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_manna_youtube_id ON daily_manna(youtube_id);
