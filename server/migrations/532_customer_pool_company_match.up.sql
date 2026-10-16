CREATE INDEX CONCURRENTLY customer_pool_company_match_idx ON customer_pool_company (status, lower(country), lower(industry), observed_at);
