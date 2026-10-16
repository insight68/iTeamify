-- A product category for a published signal.
--
-- The homepage signal preview has been rendering a "品类" chip since the export
-- repositioning, but the item table had no such field, so the preview was
-- showing a dimension the data model did not have. This adds it.
--
-- Additive with an empty default on purpose: rows published before this
-- migration keep an empty category, and the reader omits the chip when it is
-- empty, so no backfill is required and nothing has to be republished.

ALTER TABLE daily_opportunity_item
    ADD COLUMN category TEXT NOT NULL DEFAULT '',
    ADD CONSTRAINT daily_opportunity_item_category_length CHECK (char_length(category) <= 80);
