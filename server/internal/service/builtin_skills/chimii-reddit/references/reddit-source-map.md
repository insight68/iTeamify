# Reddit V1 source map

- `server/cmd/iteamify/cmd_reddit.go`: connections/search/thread/draft/drafts CLI; no send command.
- `server/internal/handler/reddit_workspace.go`: authenticated workspace/task boundaries and human admin approval.
- `server/internal/integrations/reddit/workspace.go`: workspace OAuth, encrypted credentials, shared database budget.
- `server/internal/integrations/reddit/read.go`: public-community checks, bounded reads, source versions.
- `server/internal/integrations/reddit/drafts.go`: draft versions, atomic approval/claims, receipts, unknown-state verification and cleanup.
- `server/internal/scheduler/jobs_reddit.go`: delivery and cleanup job registration.
- `packages/views/connections/components/channels/reddit-connections.tsx`: shared Web/Desktop review flow.
- `tasks/prd-reddit-community-ingestion-v1.md`: scope, deployment configuration and validation.
