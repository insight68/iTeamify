CREATE INDEX CONCURRENTLY customer_pool_contact_match_idx ON customer_pool_contact (company_id, status, email_status, observed_at);
