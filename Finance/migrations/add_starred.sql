-- 1. 合併 home_phone → phone（phone 為空時補上 home_phone 的值）
UPDATE members
SET phone = home_phone
WHERE (phone IS NULL OR phone = '')
  AND home_phone IS NOT NULL
  AND home_phone != '';

-- 2. 新增 starred 欄位
ALTER TABLE members ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
