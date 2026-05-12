ALTER TABLE members ADD COLUMN import_pid TEXT;
ALTER TABLE members ADD COLUMN first_name TEXT;
ALTER TABLE members ADD COLUMN last_name TEXT;
ALTER TABLE members ADD COLUMN partner TEXT;
ALTER TABLE members ADD COLUMN home_phone TEXT;
ALTER TABLE members ADD COLUMN address TEXT;
ALTER TABLE members ADD COLUMN city TEXT;
ALTER TABLE members ADD COLUMN state_region TEXT;
ALTER TABLE members ADD COLUMN postal_code TEXT;
ALTER TABLE members ADD COLUMN contact_confirmed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN external_contact INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN import_source TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_import_pid ON members(import_pid);
