---
name: iteamify-runtimes-and-repos
description: "Use when inspecting or debugging iTeamify runtimes, daemon task claiming, agent not running, workdir/session reuse, or repository checkout. Covers runtime online/offline state, daemon heartbeat/claim chain, task-scoped repo checkout, project repo context, local_directory caveats, and safe diagnostic commands."
user-invocable: false
allowed-tools: Bash(iteamify *)
---

# iTeamify Runtimes and Repos

## Quick start

For "agent did not run" or "repo checkout failed", read the chain before changing anything:

```bash
iteamify agent get <agent-id> --output json
iteamify runtime list --output json
iteamify repo checkout <repo-url>
```

Runtime and repo commands affect active agent execution. Do not restart daemons, update runtimes, or check out arbitrary repos just to test.

## Core model

A runtime is the execution target behind an agent. A daemon owns local runtime processes and claims queued tasks from the server.

The chain is:

1. user action creates or updates an `agent_task_queue` row;
2. the task points at an agent and runtime;
3. server wakes the runtime over daemon websocket when possible;
4. daemon polls/claims the task;
5. server returns task context, repos, project resources, prior session/workdir hints, and task token;
6. daemon prepares a workdir and launches the provider CLI, or runs OpenAgent's embedded SDK;
7. provider output, usage, and the terminal result are reported to the server;
8. `iteamify repo checkout` talks to the local daemon, not directly to GitHub.

OpenAgent saves complete conversation rounds in the task workdir before exposing
a resume pointer. Broken model streams, turn/budget/output limits, cancellation,
and runtime failures retain observed usage and do not count as successful completion.
Managed OpenAgent initialization requires the configured MCP tools to be available.

The daemon keeps undelivered message, usage, session, and terminal receipts in a
private local journal. It retries delivery during execution and after restart;
message retries use the original task sequence and do not duplicate stored rows.
Tasks with a saved terminal receipt are excluded from startup orphan retry, so
delivery recovery does not re-run their business tools. A local completed result
is not proof that the server has received it. Keep task workdirs while receipts
are pending; the daemon's GC protects them automatically.

## CLI

```bash
iteamify runtime list --output json
iteamify runtime usage <runtime-id> --output json
iteamify runtime activity <runtime-id> --output json
iteamify runtime update <runtime-id> --target-version <version> --output json
iteamify runtime delete <runtime-id>
iteamify repo checkout <url>
iteamify repo checkout <url> --ref <branch-or-sha>
```

`runtime update` and `runtime delete` are writes. Starting a runtime update is limited to its owner or a workspace owner/admin; the original initiator may keep polling that specific in-flight request if their admin role changes. `runtime delete` removes a runtime registration; if active agents are still bound, it refuses unless the user explicitly passes `--cascade`, which archives those agents and cancels their queued/running tasks before deleting the runtime. `repo checkout` creates a dedicated branch in the task working directory. Most runtimes use a linked worktree; Linux Codex uses task-local Git metadata so its `workspace-write` sandbox can stage and commit without making the shared `.repos` cache writable.

`repo checkout` requires `ITEAMIFY_DAEMON_PORT`; it is intended to run inside a daemon task. If absent, you are not in the normal agent checkout path. When a project `github_repo` resource has `resource_ref.ref`, `repo checkout <url>` uses that ref by default for the current task; an explicit `repo checkout <url> --ref <branch-or-sha>` overrides it.

## Debugging an agent that did not run

Check in this order:

1. Was a task supposed to be created? Inspect issue/comment/autopilot context.
2. Is the assignee an agent or squad? A squad routes to its leader.
3. Is the agent archived or bound to a runtime the actor cannot use?
4. Is the runtime online? `iteamify runtime list --output json`.
5. Did the daemon heartbeat recently? Runtime `last_seen_at` is the visible clue.
6. Did the task get claimed or is it stuck pending/running/waiting for local directory?
7. If repo checkout failed, classify it after checking whether repo context was
   present in the task/project context.

## Repos

The runtime brief lists repos available to this task. Treat that list as the authority for agent checkout unless the user explicitly asks to bind a new project resource.

Workspace repos and project resources are not the same thing:

- workspace repo metadata can appear in workspace context;
- `github_repo` project resources are durable project context and can affect future tasks; optional `resource_ref.ref` pins the default checkout ref for tasks in that project;
- `local_directory` resources point at a path owned by a daemon and carry local-machine assumptions.

Do not add a project resource just because `repo checkout` failed. First determine whether the user asked for durable project context or just a task checkout.

More source-backed details: `references/runtimes-and-repos-source-map.md`.
