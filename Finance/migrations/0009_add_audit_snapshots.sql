-- 0009: 操作日誌前後快照（記錄每次操作前/後的完整內容）

ALTER TABLE audit_logs ADD COLUMN before_json TEXT;
ALTER TABLE audit_logs ADD COLUMN after_json TEXT;
