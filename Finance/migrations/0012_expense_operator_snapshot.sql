-- 0012: 為 expenses 增加操作人姓名 snapshot 欄位
-- 背景：approved_by / invoiced_by / accounted_by 存的是 member.id，但執行操作的「user」不一定關聯 member。
-- 不關聯時欄位寫 NULL，前端就只能看到日期沒有姓名。
-- 解法：每次動作時，把當前登入使用者的顯示名直接 snapshot 一份。

ALTER TABLE expenses ADD COLUMN approved_by_text TEXT;
ALTER TABLE expenses ADD COLUMN invoiced_by_text TEXT;
ALTER TABLE expenses ADD COLUMN accounted_by_text TEXT;

-- Best-effort backfill：歷史資料中 *_by 有指向 member 的，就把 member.name 填進 *_by_text
UPDATE expenses SET approved_by_text = (SELECT name FROM members WHERE members.id = expenses.approved_by)
  WHERE approved_by IS NOT NULL AND approved_by_text IS NULL;
UPDATE expenses SET invoiced_by_text = (SELECT name FROM members WHERE members.id = expenses.invoiced_by)
  WHERE invoiced_by IS NOT NULL AND invoiced_by_text IS NULL;
UPDATE expenses SET accounted_by_text = (SELECT name FROM members WHERE members.id = expenses.accounted_by)
  WHERE accounted_by IS NOT NULL AND accounted_by_text IS NULL;
