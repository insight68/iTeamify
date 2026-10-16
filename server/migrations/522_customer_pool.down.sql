ALTER TABLE billing_settings DROP COLUMN customer_pool_price_micro, DROP COLUMN customer_pool_price_version;
ALTER TABLE lead_sources DROP COLUMN lead_contact_id, DROP COLUMN metadata;
DROP TABLE customer_pool_event, customer_pool_provider_call, customer_pool_request_item, customer_pool_request, customer_pool_source_record, customer_pool_source, customer_pool_contact, customer_pool_company;
