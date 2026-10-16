# Projects and resources source map

- `server/cmd/iteamify/cmd_project.go` registers project `list`, `get`, `create`, `update`, `delete`, and `status`.
- The same file registers `project resource list/add/update/remove`.
- `project create --repo` attaches `github_repo` resources during project creation.
- `project create` / `project update` accept `--start-date` / `--due-date` (calendar days, `YYYY-MM-DD`), mapping to the project `start_date` / `due_date` columns (migration `166_project_dates`); an empty `--start-date ""`/`--due-date ""` on update clears the date, mirroring the issue date flags in `cmd_issue.go`.
- `project resource add` supports shortcuts for `github_repo` (`--url`, non-JSON `--ref` for checkout ref, `--default-branch-hint`) and `local_directory` (`--local-path`, `--daemon-id`, `--ref-label`), or generic JSON `--ref '<json>'`.
- `project resource update` merges shortcut edits with existing `resource_ref` so a partial edit does not clobber required fields; non-JSON `--ref` updates `github_repo.resource_ref.ref`.
- `server/cmd/server/router.go` exposes `/api/projects` plus `/api/projects/{projectId}/resources` routes.
- `server/pkg/db/queries/project_resource.sql` is the CRUD query surface for `project_resource` rows.
- Project resources are written into `.iteamify/project/resources.json` for agent workdirs.
- `github_repo.resource_ref.ref` is lifted into daemon `RepoData.Ref` by `server/internal/handler/daemon.go`; `server/internal/daemon/daemon.go` stores it per task, and `server/internal/daemon/health.go` uses it as the default `/repo/checkout` ref when the checkout request does not explicitly pass one.
- A project's `description` is injected as durable context for every task in the project. The claim handler (`server/internal/handler/daemon.go`) reads `proj.Description` onto the claim response (`ProjectDescription`, `server/internal/handler/agent.go`); the daemon carries it through `Task` (`server/internal/daemon/types.go`) and `TaskContextForEnv` (`server/internal/daemon/execenv/execenv.go`) into the brief's `## Project Context` section (`server/internal/daemon/execenv/runtime_config.go`) and into `.iteamify/project/resources.json` as `project_description` (`server/internal/daemon/execenv/context.go`).

- Applications lists Projects as a built-in application. `packages/views/projects/components/` owns the shared Web/Desktop initiation, assignment, result submission, and acceptance UI.
- `GET /api/projects/workflows`, `GET /api/projects/{id}/workflow`, and human-only `POST /api/projects/{id}/workflow` are implemented in `server/internal/handler/project_workflow.go`. Actions require the current workflow version; approval also requires the exact reviewed result.
- Migrations `385`–`387` add `project_workflow` and its concurrent unique indexes. Project creation writes the project, workflow, and resources in one transaction; assignment locks the project/workflow and creates one execution issue atomically.
- `server/internal/service/project_workflow.go` defines allowed transitions and maps execution `done`/`in_review` to pending human acceptance. Agent dispatch reuses `TaskService.EnqueueTaskForIssueWithHandoff`; submitted results and rejection notes are retained by the workflow and execution comments.
