# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Conventions reference

The single source of truth for **code naming, the i18n translation glossary, and the Chinese voice guide** is the docs site:

- **`apps/docs/content/docs/developers/conventions.mdx`** (English)
- **`apps/docs/content/docs/developers/conventions.zh.mdx`** (Chinese)

Read that page before:

- Writing or editing translations (`packages/views/locales/`)
- Naming a new route, package, file, DB column, or TS type
- Writing Chinese product copy (UI strings, error messages, docs)

The legacy `packages/views/locales/glossary.md` is now a stub redirecting to the docs page; do not rely on it.

### i18n

Translations use `react-i18next`. Locale JSON files live in `packages/views/locales/{en,zh-Hans}/` namespaced by domain (`issues.json`, `auth.json`, `settings.json`, etc.). The i18n setup is in `packages/core/i18n/`.

## Project Context

Teamify is an AI-native task management platform — like Linear, but with AI agents as first-class citizens.

- Agents can be assigned issues, create issues, comment, and change status
- Supports local (daemon) and cloud agent runtimes
- Built for 2-10 person AI-native teams

**This is the frontend-only repository.** The Go backend runs separately and is accessed remotely via `REMOTE_API_URL`. Next.js `rewrites` proxy API/WS requests to the backend.

## Architecture

**Monorepo frontend (pnpm workspaces + Turborepo) with shared packages.**

- `apps/web/` — Next.js frontend (App Router, port 3000)
- `apps/desktop/` — Electron desktop app (electron-vite)
- `packages/core/` — Headless business logic (zero react-dom, all-platform reuse)
- `packages/ui/` — Atomic UI components (zero business logic)
- `packages/views/` — Shared business pages/components (zero next/* imports, zero react-router imports)
- `packages/eslint-config/` — Shared ESLint configs (`base.js`, `react.js`, `next.js`)
- `packages/tsconfig/` — Shared TypeScript configuration

### Key Architectural Decisions

**Internal Packages pattern** — all shared packages export raw `.ts`/`.tsx` files (no pre-compilation). The consuming app's bundler compiles them directly. This gives zero-config HMR and instant go-to-definition.

**Dependency direction:** `views/ → core/ + ui/`. Core and UI are independent of each other. No package imports from `next/*`, `react-router-dom`, or app-specific code.

**Platform bridge:** `packages/core/platform/` provides `CoreProvider` — initializes API client, auth/workspace stores, WS connection, and QueryClient. Each app wraps its root with `<CoreProvider>` and provides its own `NavigationAdapter` for routing.

**API proxying:** `apps/web/next.config.ts` rewrites `/api/*`, `/ws`, `/auth/*`, and `/uploads/*` to `REMOTE_API_URL` (defaults to `http://localhost:8080`). No Next.js middleware is used. The desktop app connects directly to the backend.

**pnpm catalog** — `pnpm-workspace.yaml` defines `catalog:` for version pinning. All shared deps use `catalog:` references to guarantee a single version across all packages. When adding new shared deps (including test deps), add to catalog first.

### State Management

The architecture relies on a strict split between server state and client state. Mixing them is the most common way to break it.

- **TanStack Query owns all server state.** Issues, users, workspaces, inbox — anything fetched from the API lives in the Query cache. WS events keep it fresh via invalidation; no polling, no `staleTime` workarounds.
- **Zustand owns all client state.** UI selections, filters, drafts, modal state, navigation history. Stores live in `packages/core/` (never in `packages/views/`) so both apps share them.
- **React Context** is reserved for cross-cutting platform plumbing — `WorkspaceIdProvider`, `NavigationProvider`. Don't reach for it for general state.
- **Auth and workspace stores are the only stores allowed to call `api.*` directly**, because they manage critical state that must exist before queries can run. They're created via factory + injected dependencies, registered by the platform layer.

**Hard rules — these are how the architecture stays coherent:**

- **Never duplicate server data into Zustand.** If it came from the API, it belongs in the Query cache. Copying it into a store creates two sources of truth and they will drift.
- **Workspace-scoped queries must key on `wsId`.** This is what makes workspace switching automatic — the cache key changes, the right data appears, no manual invalidation needed.
- **Mutations are optimistic by default.** Apply the change locally, send the request, roll back on failure, invalidate on settle. The user shouldn't wait for the server.
- **WS events invalidate queries — they never write to stores directly.** This keeps the cache as the single source of truth and avoids race conditions.
- **Persist what's worth preserving across restarts** (user preferences, drafts, tab layout). **Don't persist ephemeral UI state** (modal open/close, transient selections) or server data.

**Common Zustand footguns to avoid:**

- Selectors must return stable references. Returning a freshly built object or array on every call (e.g. `s => ({ a: s.a, b: s.b })` or `s => s.items.map(...)`) triggers infinite re-renders. Either select primitives separately or use shallow comparison.
- Hooks that need workspace context should accept `wsId` as a parameter, not call `useWorkspaceId()` internally — this lets them work outside the `WorkspaceIdProvider` (e.g. in a sidebar that renders before workspace is loaded).

## Commands

```bash
# One-command dev (auto-setup + start frontend)
make dev              # Auto-creates env, installs deps, launches frontend

# Explicit setup & run (if you prefer separate steps)
make setup            # Install deps and ensure .env exists
make start            # Start frontend dev server
make stop             # Stop frontend processes

# Frontend (all commands go through Turborepo)
pnpm install
pnpm dev:web          # Next.js dev server (port 3000)
pnpm dev:desktop      # Electron dev (electron-vite, HMR)
pnpm build            # Build all frontend apps
pnpm typecheck        # TypeScript check (all packages + apps via turbo)
pnpm lint             # ESLint
pnpm test             # TS tests (Vitest, all packages + apps via turbo)

# Run a single TS test (works for any package with a test script)
pnpm --filter @teamify/views exec vitest run auth/login-page.test.tsx
pnpm --filter @teamify/core exec vitest run runtimes/version.test.ts
pnpm --filter @teamify/web exec vitest run app/\(auth\)/login/page.test.tsx

# Desktop build & package
pnpm --filter @teamify/desktop build      # Compile TS → JS (reads .env.production)
pnpm --filter @teamify/desktop package    # Package into .app/.dmg/.exe (current platform only)

# shadcn — config lives in packages/ui/components.json (Base UI variant, base-nova style)
pnpm ui:add badge                # Adds component to packages/ui/components/ui/
```

### CI Requirements

CI runs on Node 22. See `.github/workflows/ci.yml`.

## Coding Rules

- TypeScript strict mode is enabled; keep types explicit.
- Keep comments in code **English only**.
- Prefer existing patterns/components over introducing parallel abstractions.
- Unless the user explicitly asks for backwards compatibility, do **not** add compatibility layers, fallback paths, dual-write logic, legacy adapters, or temporary shims **for internal, non-boundary code** (a function calling another function in the same package, a component reading its own state, a store helper, etc.).
- This rule does **not** apply at API boundaries: the desktop app cannot assume the backend it talks to has the same shape as the one it was built against (older desktop installs will outlive any given server build). API response handling must follow the rules in **API Response Compatibility** below — that is a defensive boundary, not a legacy shim.
- If a flow or API is being replaced and the product is not yet live, prefer removing the old path instead of preserving both old and new behavior.
- Avoid broad refactors unless required by the task.
- New global (pre-workspace) routes MUST use a single word (`/login`, `/inbox`) or a `/{noun}/{verb}` pair (`/workspaces/new`). NEVER add hyphenated word-group root routes (`/new-workspace`, `/create-team`) — they collide with common user workspace names and force endless reserved-slug audits. Reserving the noun (`workspaces`) automatically protects the entire `/workspaces/*` subtree.
- The reserved-slug list is hand-maintained in `packages/core/paths/reserved-slugs.ts`. Add new slugs there when adding new global routes.

### API Response Compatibility

The desktop app installed on a user's machine is older than any backend it talks to: a user on 0.2.26 will hit a server running 0.3.x, then 0.4.x, then beyond. Every response shape is a contract that **will** drift, and the frontend must survive drift without white-screening. Three concrete incidents already happened from violating this — #2143, #2147, #2192.

When writing code that consumes an API response, follow these rules:

- **Parse, don't cast.** Untyped JSON crossing the network is not `T`. Use `parseWithFallback` in `packages/core/api/schema.ts` with a `zod` schema and an explicit fallback. On validation failure it logs a warning and returns the fallback; it never throws into the UI.
- **No bare `as` casts on response bodies.** Every endpoint method whose response is consumed by UI logic must run through a schema before returning.
- **Optional-chain and default everywhere downstream.** Treat every field as possibly missing. Use explicit boolean checks (`=== true`) over truthy/falsy negation, which silently treats `undefined` and `null` as `false`.
- **Don't pin a UI affordance to a single backend field.** If a button or indicator depends on exactly one boolean from the server, a backend bug deletes it. Combine signals (cursor presence, page length, etc.) so the affordance stays available in the worst case.
- **Enum drift downgrades, not crashes.** A new server-side enum value should render a generic fallback. `switch` statements on server-driven strings must have a `default` branch.
- **When you add or change an endpoint:** add the schema in the same PR, and write at least one test that feeds a malformed response through it (missing field, wrong type, `null` array). The test fails closed if a future change breaks the contract.

This is not premature defense — it is the *only* defense for an installed-app architecture. CSR-only browser apps can ship a fix in minutes; an Electron build sitting on a developer's laptop cannot.

### Package Boundary Rules

These are hard constraints. Violating them breaks the cross-platform architecture:

- `packages/core/` — zero react-dom, zero localStorage (use StorageAdapter), zero process.env, zero UI libraries. **All shared Zustand stores live here**, even view-related ones (filters, view modes) — stores are pure state, not UI.
- `packages/ui/` — zero `@teamify/core` imports (pure UI, no business logic).
- `packages/views/` — zero `next/*` imports, zero `react-router-dom` imports, zero stores. Use `NavigationAdapter` for all routing.
- `apps/web/platform/` — the only place for Next.js APIs (`next/navigation`).
- `apps/desktop/src/renderer/src/platform/` — the only place for react-router-dom navigation wiring.

### The No-Duplication Rule

**If the same logic exists in both apps, it must be extracted to a shared package.**

This applies to everything: components, hooks, guards, providers, utility functions. The decision process:

1. Does this code depend on Next.js or Electron APIs? → Keep in the respective app.
2. Does it depend on `react-router-dom` or `next/navigation`? → Keep in app's `platform/` layer.
3. Everything else → belongs in `packages/core/` (headless logic) or `packages/views/` (UI components).

When the two apps need different behavior for the same concept (e.g., different loading UI), extract the shared logic into a component with props/slots for the differences. Don't duplicate the logic.

### Cross-Platform Development Rules

When adding a new page or feature:

1. **New page component** → add to `packages/views/<domain>/`. Never import from `next/*` or `react-router-dom`.
2. **Wire it in both apps** → add a route in `apps/web/app/` (Next.js page file) AND in the desktop router. **Exception**: pre-workspace transition flows (create workspace, accept invite) are NOT routes on desktop — they're `WindowOverlay` state. See *Desktop-specific Rules → Route categories*.
3. **Navigation** → use `useNavigation().push()` or `<AppLink>`. Never use framework-specific link/router APIs in shared code.
4. **Shared guards/providers** → use `DashboardGuard` from `packages/views/layout/`. Don't create separate guard logic per app.
5. **Platform-specific UI** → if a feature is web-only or desktop-only, keep it in the respective app. Use props slots (`extra`, `topSlot`) on shared layout components to inject platform-specific UI.
6. **New hooks that need workspace context** → accept `wsId` as parameter instead of reading from `useWorkspaceId()` Context, so they work both inside and outside `WorkspaceIdProvider`.

### CSS Architecture

Both apps share the same CSS foundation from `packages/ui/styles/`.

- **Design tokens** → use semantic tokens (`bg-background`, `text-muted-foreground`). Never use hardcoded Tailwind colors (`text-red-500`, `bg-gray-100`).
- **Shared styles** → `packages/ui/styles/`. Never duplicate scrollbar styling, keyframes, or base layer rules in app CSS.
- **`@source` directives** → both apps scan shared packages so Tailwind sees all class names.

## Desktop-specific Rules

These rules apply to `apps/desktop/` only. Web has different constraints (URL bar, SSR, no tabs) and doesn't share these concerns. Every rule in this section was added after a concrete bug — treat them as enforced, not suggestions.

### Route categories

Every path in the desktop app falls into exactly one category. Choosing the wrong one reproduces bugs we've already fixed.

- **Session routes** — workspace-scoped pages (`/:slug/issues`, `/:slug/settings`). Rendered by the per-tab memory router under `WorkspaceRouteLayout`. These are legitimate tab destinations.
- **Transition flows** — pre-workspace / one-shot actions (create workspace, accept invite). **NOT routes.** They live as `WindowOverlay` state, dispatched when the navigation adapter sees `push('/workspaces/new')` or `push('/invite/<id>')`. The shared view (`NewWorkspacePage`, `InvitePage`) is the content; the overlay wrapper supplies platform chrome.
- **Error / stale states** — "workspace not available", tabs pointing at a revoked workspace. **NOT pages.** `WorkspaceRouteLayout` auto-heals by dropping the stale tab group from the store; the user never lands on an explicit error screen. Web keeps `NoAccessPage` (shareable URL makes the error state meaningful); desktop has no URL bar so stale = heal silently.

**Adding a new pre-workspace flow on desktop**: register a new `WindowOverlay` type in `stores/window-overlay-store.ts`. Do NOT add it to `routes.tsx`. If a shared view needs the flow on both platforms, add the route on web (`apps/web/app/(auth)/...`) AND the overlay type on desktop — the shared view component is identical.

### Workspace context

`setCurrentWorkspace(slug, uuid)` from `@teamify/core/platform` is the single source of truth for the active workspace. `WorkspaceRouteLayout` sets it on mount; unmount does NOT clear it. Code that leaves workspace context (leave/delete workspace, force-navigate to overlay) must call `setCurrentWorkspace(null, null)` explicitly.

### Workspace destructive operations

Leave / Delete workspace flows must follow this order, otherwise concurrent refetches race and the renderer hard-reloads:

1. Read destination from cached workspace list.
2. `setCurrentWorkspace(null, null)`.
3. `navigation.push(destination)`.
4. THEN `await mutation.mutateAsync(workspaceId)`.

### Tab isolation

Tabs are grouped per workspace in `stores/tab-store.ts`. The TabBar shows only the active workspace's tabs; cross-workspace tab leakage is impossible by construction (no flat global tabs array).

Cross-workspace `push(path)` is detected by the navigation adapter (`platform/navigation.tsx`) and translated into `switchWorkspace(slug, targetPath)` — NOT a navigation within the current tab's router. Don't bypass the adapter; always go through `useNavigation()` from shared code.

### Drag region (macOS)

Every full-window desktop view (anything outside the dashboard shell) must mount `<DragStrip />` from `@teamify/views/platform` as the first flex child of the page root, otherwise users can't drag the window. Interactive UI inside the top 48px needs `WebkitAppRegion: "no-drag"` to stay clickable.

## UI/UX Rules

- Prefer shadcn components over custom implementations. Install via `pnpm ui:add <component>` from project root — adds to `packages/ui/components/ui/`. All components use Base UI primitives (`@base-ui/react`), not Radix.
- Use shadcn design tokens for styling. Avoid hardcoded color values.
- Do not introduce extra state (useState, context, reducers) unless explicitly required by the design.
- Pay close attention to **overflow** (truncate long text, scrollable containers), **alignment**, and **spacing** consistency.
- **If a component is identical between web and desktop, it belongs in a shared package.** Do not copy-paste between apps.

## Testing Rules

### Where to write tests

Tests follow the code, not the app. This is the most important testing principle in this monorepo:

| What you're testing | Where the test lives | Why |
|---|---|---|
| Shared business logic (stores, queries, hooks) | `packages/core/*.test.ts` | No DOM needed, pure logic |
| Shared UI components (pages, forms, modals) | `packages/views/*.test.tsx` | jsdom, no framework mocks |
| Platform-specific wiring (cookies, redirects, searchParams) | `apps/web/*.test.tsx` or `apps/desktop/` | Needs framework-specific mocks |

**Never test shared component behavior in an app's test file.** If a test requires mocking `next/navigation` or `react-router-dom` to test a component from `@teamify/views`, the test is in the wrong place — move it to `packages/views/` and mock `@teamify/core` instead.

### Test infrastructure

- `packages/core/` — Vitest, Node environment (no DOM)
- `packages/views/` — Vitest, jsdom environment, `@testing-library/react`
- `apps/web/` — Vitest, jsdom environment, framework-specific mocks

All test deps are in the pnpm catalog for unified versioning.

### Mocking conventions

- Mock `@teamify/core` stores with `vi.hoisted()` + `Object.assign(selectorFn, { getState })` pattern (Zustand stores are both callable and have `.getState()`).
- Mock `@teamify/core/api` for API calls.
- In `packages/views/` tests: never mock `next/*` or `react-router-dom` — those don't exist here.
- In `apps/web/` tests: mock framework-specific APIs only for platform-specific behavior.

### TDD workflow

1. Write failing test in the **correct package** first.
2. Write implementation.
3. Run `pnpm test` (Turborepo discovers all packages).
4. Green → done.

## Commit Rules

- Use atomic commits grouped by logical intent.
- Conventional format: `feat(scope)`, `fix(scope)`, `refactor(scope)`, `docs`, `test(scope)`, `chore(scope)`.

## Minimum Pre-Push Checks

```bash
make check    # Runs all checks: typecheck, unit tests, lint
```

Run verification only when the user explicitly asks for it.

For targeted checks when requested:
```bash
pnpm typecheck        # TypeScript type errors only
pnpm test             # TS unit tests only (Vitest, all packages)
pnpm lint             # ESLint only
```

## AI Agent Verification Loop

After writing or modifying code, always run the full verification pipeline:

```bash
make check
```

**Workflow:**
- Write code to satisfy the requirement
- Run `make check`
- If any step fails, read the error output, fix the code, and re-run
- Repeat until all checks pass
- Only then consider the task complete

**Quick iteration:** Run individual checks first for faster feedback, then finish with a full `make check` before marking work complete.

## Multi-tenancy

All queries filter by `workspace_id`. Membership checks gate access. `X-Workspace-ID` header routes requests to the correct workspace.

## Agent Assignees

Assignees are polymorphic — can be a member or an agent. `assignee_type` + `assignee_id` on issues. Agents render with distinct styling (purple background, robot icon).
