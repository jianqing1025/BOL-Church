-- Short display name for expense categories. The existing `name` is the long
-- type shown on the website; `short_name` (optional) is shown on mobile cards.
ALTER TABLE expense_categories ADD COLUMN short_name TEXT NOT NULL DEFAULT '';
