# Business module cleanup

Removed Prospector, daily opportunities, customer pools, CRM, sales experts, sales proposals, quotes and orders. Their Web/Desktop entry points, shared packages, backend routes/services/queries, MCP tools, workers, provider integration and dedicated historical code have been removed.

Local database: `iteamify_local` on loopback PostgreSQL. Forward migrations 655 and 656 succeeded. All 52 retired table names and the CRM view are absent, outbound email no longer carries CRM links, and shared billing settings no longer contain customer-pool prices. Agent MCP allowlists remove the retired tools. Applied migration history remains immutable.

Tasks, projects, chat, agents, generic billing, company information, Gmail, contract review and public web retrieval remain available. The site configuration compiler now produces only the managed workspace environments using schema v3.

Verification:

- All Web/Desktop/shared TypeScript checks and an isolated Web production build passed (50 static pages).
- Core: 1311 tests passed; schema and route checks passed after the final cleanup.
- Shared views: 93 focused tests passed; Web: 72; Desktop tabs: 55.
- Every Go package compiles. Affected Go routes, resource permissions, MCP inventory, mail, migrations and managed configuration checks passed against an isolated disposable database.
- Destructive migration tests ran twice in a rollback transaction and preserved active task/chat/email/billing fixtures.
- Go vet passed for the affected backend packages; task-scoped frontend lint passed.
- Deployment script checks and 36 local deployment tests passed.

The full Go suite is not green: it also reports skill naming, environment-variable ordering and a sampler timeout assertion outside the retired modules. No production deployment or Git commit was performed.
