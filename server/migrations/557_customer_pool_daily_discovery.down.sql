DELETE FROM customer_pool_source WHERE kind='daily_discovery';
ALTER TABLE customer_pool_source DROP CONSTRAINT customer_pool_source_kind_check;
ALTER TABLE customer_pool_source ADD CONSTRAINT customer_pool_source_kind_check CHECK(kind IN ('own_search','apollo','import'));
