CREATE INDEX CONCURRENTLY outbound_email_queue_idx ON outbound_email (available_at) WHERE status IN ('queued', 'sending');
