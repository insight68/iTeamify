CREATE INDEX CONCURRENTLY managed_assembly_rollout_target_queue_idx ON managed_assembly_rollout_target (rollout_id, status, sequence_no, id);
