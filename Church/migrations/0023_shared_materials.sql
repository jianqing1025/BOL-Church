-- 資料上傳 / 共享資料: materials people send in for a Sunday (videos, PPT, links), collected by staff.
CREATE TABLE IF NOT EXISTS shared_materials (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  name TEXT NOT NULL,
  contact TEXT,
  sunday TEXT,
  note TEXT,
  links TEXT NOT NULL DEFAULT '[]',
  files TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new',
  ip TEXT
);
CREATE INDEX IF NOT EXISTS shared_materials_created ON shared_materials (created_at);

-- Every file put into R2 (shared/…): a submission may only name these, and the rate limit counts them.
CREATE TABLE IF NOT EXISTS shared_material_uploads (
  key TEXT PRIMARY KEY,
  ip TEXT,
  size INTEGER,
  uploaded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS shared_material_uploads_ip ON shared_material_uploads (ip, uploaded_at);
