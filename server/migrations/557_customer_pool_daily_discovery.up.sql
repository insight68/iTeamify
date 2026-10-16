ALTER TABLE customer_pool_source DROP CONSTRAINT customer_pool_source_kind_check;
ALTER TABLE customer_pool_source ADD CONSTRAINT customer_pool_source_kind_check CHECK(kind IN ('own_search','apollo','import','daily_discovery'));
INSERT INTO customer_pool_source(kind,name,account_key,enabled) VALUES ('daily_discovery','每日商机发现','daily_discovery:platform',true);
