-- 對帳：一個期間可有多筆入帳（JSON 陣列 [{ amount, date, notes }]）。
-- deposit_amount / deposit_date / notes 仍保存合計、最晚日期與串起來的備註；沒有 deposits 的舊資料讀取時視為單筆入帳。
-- 程式在第一次存檔時也會自行補上這個欄位（見 ensureReconDepositsColumn），D1 與 VPS 備援都適用。
ALTER TABLE reconciliations ADD COLUMN deposits TEXT;
