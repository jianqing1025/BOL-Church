-- 記錄奉獻是由哪個帳號建立的。
-- Counter（點款人員）只看得到 created_by 等於自己的資料；歷史資料為 NULL，天然不可見。
ALTER TABLE offerings ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_offerings_created_by ON offerings(created_by);
