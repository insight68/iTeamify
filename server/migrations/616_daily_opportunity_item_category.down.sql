ALTER TABLE daily_opportunity_item
    DROP CONSTRAINT IF EXISTS daily_opportunity_item_category_length,
    DROP COLUMN IF EXISTS category;
