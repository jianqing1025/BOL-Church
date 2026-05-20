-- 支出記錄新增備註欄位
ALTER TABLE expenses ADD COLUMN notes TEXT DEFAULT '';
