-- 線上查經房間改由後台管理（新增、刪除、改名稱／時間／圖片、排序）。
-- id 是 LiveKit 房名與聊天室的鍵，建立後不再改；原有六間沿用舊 id，進行中的聚會與已存的聚會內容不受影響。
-- 這張表是空的或還不存在時，網站退回 constants/meetingRooms.ts 的內建清單。

CREATE TABLE IF NOT EXISTS meeting_rooms (
  id TEXT PRIMARY KEY,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL DEFAULT '',
  schedule_zh TEXT NOT NULL DEFAULT '',
  schedule_en TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO meeting_rooms (id, name_zh, name_en, schedule_zh, schedule_en, image_url, sort_order, created_at, updated_at) VALUES
  ('bible-study-1', '聯合小組查經', 'Joint Group Bible Study', '每週二晚上7:00', 'Tuesdays at 7:00 PM', '/images/meeting-rooms/bible-study.jpg', 1, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
  ('prayer', '琴爐卷禱告會', 'Harp & Bowl Prayer Meeting', '每週三晚上7:00', 'Wednesdays at 7:00 PM', '/images/meeting-rooms/prayer.jpg', 2, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
  ('coworkers', '同工會', 'Co-worker Meeting', '時間另行公布', 'Schedule to be announced', '/images/meeting-rooms/coworkers.jpg', 3, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
  ('bible-study-3', '姊妹小組團契', 'Sisters'' Group Fellowship', '每週二晚上7:00', 'Tuesdays at 7:00 PM', '/images/meeting-rooms/sisters.jpg', 4, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
  ('bible-study-2', '弟兄小組團契', 'Brothers'' Group Fellowship', '每週二晚上7:00', 'Tuesdays at 7:00 PM', '/images/meeting-rooms/brothers.jpg', 5, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z'),
  ('youth', '青少年團契', 'Youth Fellowship', '時間另行公布', 'Schedule to be announced', '/images/meeting-rooms/youth.jpg', 6, '2026-10-08T00:00:00.000Z', '2026-10-08T00:00:00.000Z');
