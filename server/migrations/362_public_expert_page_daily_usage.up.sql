CREATE INDEX CONCURRENTLY public_expert_reservation_page_daily_usage_idx ON public_expert_usage_reservation (page_id, created_at) INCLUDE (status, reserved_cost_minor, reserved_tokens);
