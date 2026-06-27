-- Reorganize offering methods into grouped (Cash / Check / Electronic /
-- Investment) options with display order, merging duplicates and dropping the
-- bare Chinese 現金/支票 entries.

ALTER TABLE offering_methods ADD COLUMN group_name TEXT NOT NULL DEFAULT '';
ALTER TABLE offering_methods ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

-- Merge duplicates into canonical rows, then drop the extras + 現金.
--   $ Cash by Unknown Name -> Cash/Unknown (canonical "Cash - Unknown Name")
--   支票 -> Check (canonical "Check")
UPDATE offerings SET method_id = 'import-2017-method-cash'  WHERE method_id = 'import-2019-method-usdcun';
UPDATE offerings SET method_id = 'import-2017-method-check' WHERE method_id = 'method-check';
DELETE FROM offering_methods WHERE id IN ('import-2019-method-usdcun', 'method-check', 'method-cash');

-- Cash group
UPDATE offering_methods SET name = 'Cash - Known Name',            group_name = 'Cash',       sort_order = 10 WHERE id = 'import-2019-method-usdckn';
UPDATE offering_methods SET name = 'Cash - Unknown Name',          group_name = 'Cash',       sort_order = 11 WHERE id = 'import-2017-method-cash';
UPDATE offering_methods SET name = 'Other Currency - Known Name',  group_name = 'Cash',       sort_order = 12 WHERE id = 'import-2019-method-otherckn';
UPDATE offering_methods SET name = 'Other Currency - Unknown Name', group_name = 'Cash',      sort_order = 13 WHERE id = 'import-2019-method-othercun';

-- Check group
UPDATE offering_methods SET name = 'Check Offering', group_name = 'Check', sort_order = 20 WHERE id = 'import-2019-method-usdchk';
UPDATE offering_methods SET name = 'Check',          group_name = 'Check', sort_order = 21 WHERE id = 'import-2017-method-check';

-- Electronic group
UPDATE offering_methods SET name = 'Online Offering', group_name = 'Electronic', sort_order = 30 WHERE id = 'method-online';
UPDATE offering_methods SET name = 'Bank Transfer',   group_name = 'Electronic', sort_order = 31 WHERE id = 'method-transfer';

-- Investment group
UPDATE offering_methods SET name = 'USD Securities', group_name = 'Investment', sort_order = 40 WHERE id = 'import-2019-method-usdsec';
