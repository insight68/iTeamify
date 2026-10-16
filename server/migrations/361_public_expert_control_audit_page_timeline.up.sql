CREATE INDEX CONCURRENTLY public_expert_control_audit_page_timeline_idx ON public_expert_control_audit (page_id, created_at DESC, id DESC);
