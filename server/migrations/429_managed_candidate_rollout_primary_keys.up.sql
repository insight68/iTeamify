ALTER TABLE managed_asset_candidate
    ADD CONSTRAINT managed_asset_candidate_pkey PRIMARY KEY USING INDEX managed_asset_candidate_id_uidx;

ALTER TABLE managed_assembly_rollout
    ADD CONSTRAINT managed_assembly_rollout_pkey PRIMARY KEY USING INDEX managed_assembly_rollout_id_uidx;

ALTER TABLE managed_assembly_rollout_target
    ADD CONSTRAINT managed_assembly_rollout_target_pkey PRIMARY KEY USING INDEX managed_assembly_rollout_target_id_uidx;

ALTER TABLE managed_provisioning_audit_event
    ADD CONSTRAINT managed_provisioning_audit_event_pkey PRIMARY KEY USING INDEX managed_provisioning_audit_event_id_uidx;
