-- 0013: 開票 / 入賬 補充欄位 + 郵件按鈕 token 表
ALTER TABLE expenses ADD COLUMN invoice_note TEXT;
ALTER TABLE expenses ADD COLUMN invoice_amount REAL;
ALTER TABLE expenses ADD COLUMN invoice_receipt_url TEXT;
ALTER TABLE expenses ADD COLUMN account_receipt_url TEXT;

CREATE TABLE IF NOT EXISTS expense_action_tokens (
  token_hash TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approve', 'reject')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  used_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expense_action_tokens_expense ON expense_action_tokens(expense_id);
