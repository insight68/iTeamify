---
name: iteamify-company-context
description: Retrieve task-pinned company facts on demand, or maintain the live Company profile through an explicitly confirmed owner/admin conversation.
---

# Company context

Use this skill whenever a task needs facts about the company, its positioning,
services, ideal customers, buyer personas, differentiators, boundaries, proof,
or sources. Production tasks use the Company snapshot pinned when the task
started; never substitute memory from another task or an unsupported inference.

For normal production work, call `company_context_get` with only the scopes the
task needs. Typical combinations:

- Lead discovery: `positioning`, `offers`, `audiences`, `boundaries`
- Contact discovery: `audiences`, `personas`
- Outreach: `positioning`, `offers`, `personas`, `boundaries`; add `proof` only
  when a factual claim needs support
- Quotes: `identity`, the selected `offers`, and `boundaries`

The tool reads the immutable system snapshot pinned to this task. Respect its
`available`, `truncated`, `omitted_scopes`, and release metadata. If a requested
fact is absent, call another relevant scope or state that it is unknown; do not
invent it. Use object IDs to narrow large collections.

When an owner or admin explicitly asks to establish or maintain the Company
profile in Chat, call `company_profile_get` with the relevant scopes. Its
`draft_revision` field is an internal concurrency token for the next update;
do not describe it as a draft or version to the user.

Interview before guessing. Distinguish facts the user stated from suggestions
you inferred. Ask for the smallest missing detail needed to make the profile
useful: what the business does, what it sells, the customer outcome, concrete
fit signals, disqualifiers, buyer roles, and evidence. Do not invent customer
logos, prices, outcomes, market coverage, or credentials.

Summarize the exact fields and values that will change. Only after the owner or
admin explicitly confirms that summary, call `company_profile_update` with
`confirmed: true`. The update becomes the current Company profile immediately.
Use only these top-level paths:

- `/brand_name`, `/website_url`, `/summary`, `/positioning`
- `/differentiators`, `/principles`, `/exclusions`
- `/offers`, `/audiences`, `/proof`, `/sources`

`company_name` is the canonical Company identity managed by an owner or admin
from the Basic Info page. Treat it as read-only in Chat: never send a
`/business_name` or `/company_name` operation. `brand_name` is optional and is
only for a public-facing brand that differs from the Company name.

Each operation uses `add`, `replace`, or `remove`. `add` sets a whole top-level
field; it does **not** append one object to a collection. For `/offers`,
`/audiences`, `/proof`, and `/sources`, the operation value must always be the
complete JSON array. To add one item, read the current array, preserve every
existing item and its `id`, append the new item, then send that complete array
with `replace`. New offers, audiences, personas, proof items, and sources may
omit `id`; the server assigns stable IDs when it saves the update.

Correct collection update shape:

```json
{
  "op": "replace",
  "path": "/offers",
  "value": [
    { "id": "existing-id", "name": "Existing service" },
    { "name": "New service" }
  ]
}
```

Never send a single object as the value of `/offers`, `/audiences`, `/proof`,
or `/sources`. Preview and execute use the same server validation; if preview
rejects an operation, correct its path or value type before asking for
confirmation.

Include a short reason per operation and source references when available. Use
`type: user_statement` or `type: conversation` for facts confirmed directly in
Chat, and `type: url` for cited web material. If `company_profile_update`
reports a revision conflict, call `company_profile_get` again, reconcile the
newer profile, and ask the user to confirm any substantive conflict before
retrying.

Do not create a proposal, ask the user to publish, or expose internal snapshot
metadata. After a successful update, tell the user that Company Basic Info was
saved and is now visible on the Company home page.
