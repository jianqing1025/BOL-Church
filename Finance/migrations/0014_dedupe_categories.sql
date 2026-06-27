-- Dedupe expense & offering categories by name.
-- The 2017 and 2019 Access imports used year-prefixed category ids, so every
-- category name ended up with one row per import year. This repoints all
-- references to the canonical row (lowest id per name) and deletes the rest.
-- Idempotent: re-running after dedupe is a no-op.

-- ── Expenses ──────────────────────────────────────────────────────────────
-- Repoint each expense to the canonical category that shares its name.
UPDATE expenses
SET category_id = (
  SELECT MIN(c.id) FROM expense_categories c
  WHERE c.name = (SELECT cc.name FROM expense_categories cc WHERE cc.id = expenses.category_id)
)
WHERE category_id IS NOT NULL;

-- Drop expense_summary rows tied to non-canonical categories
-- (UNIQUE(year_month, category_id) makes repointing unsafe; keep the canonical).
DELETE FROM expense_summary
WHERE category_id NOT IN (SELECT MIN(id) FROM expense_categories GROUP BY name);

-- Delete the duplicate expense categories.
DELETE FROM expense_categories
WHERE id NOT IN (SELECT MIN(id) FROM expense_categories GROUP BY name);

-- ── Offerings ─────────────────────────────────────────────────────────────
UPDATE offerings
SET category_id = (
  SELECT MIN(c.id) FROM offering_categories c
  WHERE c.name = (SELECT cc.name FROM offering_categories cc WHERE cc.id = offerings.category_id)
)
WHERE category_id IS NOT NULL;

DELETE FROM offering_categories
WHERE id NOT IN (SELECT MIN(id) FROM offering_categories GROUP BY name);
