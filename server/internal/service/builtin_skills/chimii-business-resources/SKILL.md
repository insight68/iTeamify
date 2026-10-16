---
name: iteamify-business-resources
description: Use the task-scoped resource catalog for company context, contract review and email drafts.
---

# Resource actions

Discover the available resources with resource_catalog and resource_describe before using them.
Use resource_query and resource_get to read current records. Resource IDs and versions must come from those reads.
For writes, preview the exact action with resource_action_preview. Execute only after the human explicitly requests that action, using an idempotency key and the required user-intent evidence.

Preview company profile edits against the current revision before execution. Email actions create or update a draft; the human sends it from Chat. Contract review actions follow their structured submission and review lifecycle.
Never invent fields, permissions, resource IDs, or actions missing from the catalog.
