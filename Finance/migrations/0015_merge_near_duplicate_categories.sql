-- Merge near-duplicate expense categories that survived the exact-name dedupe
-- (they differ by an embedded CR/LF line break, a '-' vs '/', or a "Supply,").
-- Targeted by id so the line-break variants match reliably.

-- Miscelleleous: merge all 4 variants into the one that includes "Supply,"
-- (import-2017-expense-m190).
UPDATE expenses SET category_id = 'import-2017-expense-m190'
WHERE category_id IN ('import-2017-expense-e190', 'import-2017-expense-c190', 'import-2017-expense-a190');
DELETE FROM expense_summary
WHERE category_id IN ('import-2017-expense-e190', 'import-2017-expense-c190', 'import-2017-expense-a190');
DELETE FROM expense_categories
WHERE id IN ('import-2017-expense-e190', 'import-2017-expense-c190', 'import-2017-expense-a190');

-- Training/Meeting/Business Travel: merge the line-break variant (c110) into the
-- clean one (e110).
UPDATE expenses SET category_id = 'import-2017-expense-e110'
WHERE category_id = 'import-2017-expense-c110';
DELETE FROM expense_summary WHERE category_id = 'import-2017-expense-c110';
DELETE FROM expense_categories WHERE id = 'import-2017-expense-c110';
