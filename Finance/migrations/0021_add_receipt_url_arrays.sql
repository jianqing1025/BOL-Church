-- 0021: 憑證改為可存多張圖。
-- 每個階段一個 JSON 字串陣列欄位；舊的單張欄位保留，恆等於陣列第一張，
-- 讓既有資料、郵件模板的 {{receiptUrl}} 與公開報帳頁完全不用改。
ALTER TABLE offerings ADD COLUMN receipt_urls TEXT;
ALTER TABLE expenses ADD COLUMN receipt_urls TEXT;
ALTER TABLE expenses ADD COLUMN invoice_receipt_urls TEXT;
ALTER TABLE expenses ADD COLUMN account_receipt_urls TEXT;

-- 把現有的單張憑證灌進陣列
UPDATE offerings SET receipt_urls = json_array(receipt_url)
  WHERE receipt_url IS NOT NULL AND receipt_url <> '';
UPDATE expenses SET receipt_urls = json_array(receipt_url)
  WHERE receipt_url IS NOT NULL AND receipt_url <> '';
UPDATE expenses SET invoice_receipt_urls = json_array(invoice_receipt_url)
  WHERE invoice_receipt_url IS NOT NULL AND invoice_receipt_url <> '';
UPDATE expenses SET account_receipt_urls = json_array(account_receipt_url)
  WHERE account_receipt_url IS NOT NULL AND account_receipt_url <> '';
