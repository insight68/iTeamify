# Business resource contracts and source map

- `server/internal/service/web_retrieval.go` provides bounded Tavily search and page extraction; credentials stay in the backend, public-source results carry URLs and retrieval times, and provider failures use stable non-secret codes.
- `server/internal/handler/web_retrieval.go` requires a task token and a current workspace-member human originator. `/api/chat/web/search` and `/fetch` share a workspace rate limit.
- `server/internal/managedpolicy/web_tools.go` adds only the two read-only web tools to validated ordinary managed Chat claims, covering existing and new agents without mutating immutable release snapshots. Managed readiness probes retain their exact synthetic tool boundary.
- `server/internal/daemon/execenv/runtime_config_sections.go` grounds managed capability reporting in the current tool inventory and distinguishes provider failures from unavailable host-browser sessions.

- `server/internal/assistantresource/registry.go` owns resource/action discovery, role filtering, filter bounds, confirmation, and expected-version gates.
- `server/internal/handler/assistant_resource.go` resolves the task-stamped human principal, requires current-task user-message provenance for confirmed actions, provides idempotent execution, writes `assistant_operation`, and emits `resource:changed`.
- `server/internal/handler/chat_context_resource.go` persists registry-backed records selected by product pages; the claim response injects their stable identities into the Chat prompt.
- `server/internal/daemon/prompt.go` supplies the same scoped completion and confirmed-overwrite instructions to local and managed Chat runtimes; `prompt_test.go` verifies both paths.
- `server/internal/mcpserver/server.go` exposes `resource_catalog`, `resource_describe`, `resource_query`, `resource_get`, `resource_action_preview`, and `resource_action_execute`; it exposes neither SQL nor arbitrary table writes.
- `server/migrations/268_assistant_operation.up.sql` defines the cross-domain operation ledger. Migrations 269 and 270 add its idempotency and task-history indexes concurrently.
- `server/migrations/271_chat_context_resource.up.sql` defines soft-linked Chat resource context. Migration 272 adds its session/resource uniqueness index concurrently.


- `server/internal/handler/assistant_resource_contract_review.go` registers the private `contract_review` resource and the accept/start/request_info/complete actions. A task may access only its own session, agent and human originator.
- `server/internal/service/contract_review.go` owns shared human/agent transitions, optimistic version checks, request-key replay, member/agent revalidation and encrypted file persistence.
- `server/internal/handler/contract_review.go` owns participant-scoped form APIs and authenticated downloads. Contract changes are delivered only to that session's human participants.
- `server/cmd/iteamify/cmd_contract_file.go` downloads private material using the current task credentials, into a new local file with mode 0600. Files remain encrypted in public storage; encryption keys stay in the database.
- Migrations 641–646 persist session descriptors, contract reviews, files and action history. New indexes are concurrent single-statement migrations; no foreign keys or cascades are added.

- `server/internal/handler/session_application.go` separates public discovery, own configurations and administrator management.
- `server/internal/service/session_application.go` queues each real contract submission transactionally; `contract_submission.go` gates submission intent to the current task and review.
- Migrations 648–653 add target bindings, frozen rules and task submission evidence.
