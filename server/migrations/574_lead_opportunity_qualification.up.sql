-- BANT qualification on the opportunity itself. The four elements (need,
-- budget, decision maker, timeline) describe "this deal", not "this customer":
-- a repeat order or a parallel project on the same lead has its own four.
-- Putting them on lead_opportunity is therefore the correct grain, and it
-- deliberately avoids a BANT side table plus a lead_opportunity_contact join
-- table -- small teams run a single-threaded deal, and an unpopulated join
-- table is worse than no table.
--
-- Every new column is nullable or defaulted, and nothing is backfilled. The
-- existing opportunities have no such facts; writing any default into them
-- would disguise "never asked" as "confirmed", which is the exact failure this
-- change exists to remove.
--
-- Note on the two timelines: customer_timeline is what the customer said,
-- expected_close_date is our own forecast. They stay separate on purpose --
-- the gap between them is the most informative number in the whole model.
ALTER TABLE lead_opportunity
    ADD COLUMN need_summary TEXT NOT NULL DEFAULT '',
    ADD COLUMN budget_confirmed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN budget_note TEXT,
    ADD COLUMN decision_maker_contact_id UUID,
    ADD COLUMN customer_timeline DATE,
    ADD COLUMN customer_timeline_note TEXT,
    ADD CONSTRAINT lead_opportunity_need_summary_length_check
        CHECK (length(need_summary) <= 2000),
    ADD CONSTRAINT lead_opportunity_budget_note_length_check
        CHECK (budget_note IS NULL OR length(budget_note) <= 2000),
    ADD CONSTRAINT lead_opportunity_customer_timeline_note_length_check
        CHECK (customer_timeline_note IS NULL OR length(customer_timeline_note) <= 2000);

-- Deliberately NO constraint tying customer_timeline to customer_timeline_note
-- (product decision 2026-09-12). Requiring provenance for the date sounded
-- rigorous but would have turned "who told you that?" into a form-filling
-- burden, and the realistic outcome of a burden is a fabricated note. The note
-- stays available as optional context; the UI, not the constraint, is where
-- missing provenance gets surfaced.

-- The contact's role on the buying side. This is intentionally separate from
-- is_primary: is_primary answers "who do WE talk to", buying_role answers "who
-- decides". In export trade those are frequently different people -- the
-- person who replies fastest is often not the one who signs.
ALTER TABLE lead_contacts
    ADD COLUMN buying_role TEXT NOT NULL DEFAULT 'unknown'
        CHECK (buying_role IN (
            'decision_maker', 'influencer', 'user', 'gatekeeper', 'unknown'
        ));

-- activity_type is a closed enumeration, so a new event kind only becomes
-- writable once it is listed here; otherwise the write fails at runtime with a
-- raw constraint violation. Follows the DROP+ADD shape of migrations 558/562.
--
-- Two additions:
--   * opportunity_updated -- field-level edits to the four elements and title.
--   * service_order_paid  -- already written by MarkOrderPaid but never added
--     to the enumeration, so settling an order has been failing on the CHECK
--     since that endpoint landed. Fixed here because this statement is already
--     rewriting the constraint; leaving it out would mean knowingly walking
--     past a live bug.
ALTER TABLE lead_activities
    DROP CONSTRAINT lead_activities_activity_type_check,
    ADD CONSTRAINT lead_activities_activity_type_check
        CHECK (activity_type IN (
            'created', 'updated', 'note', 'stage_changed', 'quote_accepted',
            'contact_captured', 'quote_sent', 'follow_up_requested',
            'review_changed', 'score_overridden', 'score_override_cleared',
            'score_assessed',
            'opportunity_created', 'opportunity_stage_changed', 'opportunity_updated',
            'settlement_changed', 'engagement_status_changed', 'service_order_paid',
            'parked', 'restored'
        ));
