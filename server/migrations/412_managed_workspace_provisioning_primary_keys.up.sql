ALTER TABLE managed_asset_release
    ADD CONSTRAINT managed_asset_release_pkey PRIMARY KEY USING INDEX managed_asset_release_id_uidx;

ALTER TABLE new_workspace_provisioning_policy
    ADD CONSTRAINT new_workspace_provisioning_policy_pkey PRIMARY KEY USING INDEX new_workspace_provisioning_policy_key_uidx;

ALTER TABLE workspace_provisioning_operation
    ADD CONSTRAINT workspace_provisioning_operation_pkey PRIMARY KEY USING INDEX workspace_provisioning_operation_id_uidx;
