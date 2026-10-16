"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, FolderKanban, Plus, Search } from "lucide-react";
import { projectWorkflowsOptions } from "@iteamify/core/projects";
import { useWorkspaceId } from "@iteamify/core/hooks";
import { useWorkspacePaths } from "@iteamify/core/paths";
import { useModalStore } from "@iteamify/core/modals";
import { useActorName } from "@iteamify/core/workspace/hooks";
import { Button } from "@iteamify/ui/components/ui/button";
import { Input } from "@iteamify/ui/components/ui/input";
import { BreadcrumbHeader } from "../../layout/breadcrumb-header";
import { AppLink } from "../../navigation";
import { useT } from "../../i18n";
import { WorkflowStatus, useWorkflowLabels } from "./workflow-status";

export function ProjectsPage() {
  const { t } = useT("projects");
  const wsId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const query = useQuery(projectWorkflowsOptions(wsId));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const labels = useWorkflowLabels();
  const { getActorName } = useActorName();
  const projects = query.data ?? [];
  const visible = projects.filter(
    (p) =>
      (status === "all" || p.workflow_status === status) &&
      `${p.title} ${p.description ?? ""}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const create = () => useModalStore.getState().open("create-project");
  return (
    <main className="flex h-full min-h-0 flex-col">
      <BreadcrumbHeader
        segments={[
          {
            href: paths.applications(),
            label: t(($) => $.workflow.applications),
          },
        ]}
        leaf={
          <h1 className="truncate font-medium">{t(($) => $.page.title)}</h1>
        }
        actions={
          <Button size="sm" onClick={create}>
            <Plus className="size-4" />
            {t(($) => $.workflow.create)}
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground">
              {t(($) => $.workflow.flow)}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight">
              {t(($) => $.workflow.app_description)}
            </h2>
          </div>
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label={t(($) => $.table.status)}
          >
            {["all", "planned", "in_progress", "in_review", "completed"].map(
              (value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={status === value ? "secondary" : "ghost"}
                  aria-pressed={status === value}
                  onClick={() => setStatus(value)}
                >
                  {value === "all"
                    ? t(($) => $.workflow.all)
                    : labels[value as keyof typeof labels]}
                  <span className="ml-1 text-xs tabular-nums text-muted-foreground">
                    {
                      projects.filter(
                        (p) => value === "all" || p.workflow_status === value,
                      ).length
                    }
                  </span>
                </Button>
              ),
            )}
            <div className="relative ml-auto w-full sm:w-60">
              <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label={t(($) => $.page.search_placeholder)}
                placeholder={t(($) => $.page.search_placeholder)}
              />
            </div>
          </div>
          {query.isPending ? (
            <p
              role="status"
              className="py-12 text-center text-sm text-muted-foreground"
            >
              {t(($) => $.workflow.loading)}
            </p>
          ) : query.isError ? (
            <div role="alert" className="space-y-3 rounded-xl border p-6">
              <p>{t(($) => $.workflow.load_error)}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                {t(($) => $.workflow.reload)}
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-16 text-center">
              <FolderKanban className="mx-auto mb-4 size-8 text-muted-foreground" />
              <p className="font-medium">
                {projects.length === 0
                  ? t(($) => $.page.empty)
                  : t(($) => $.page.no_matches)}
              </p>
              {projects.length === 0 && (
                <Button className="mt-5" onClick={create}>
                  {t(($) => $.page.create_first)}
                </Button>
              )}
            </div>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border">
              {visible.map((project) => (
                <li key={project.id}>
                  <AppLink
                    href={paths.projectDetail(project.id)}
                    className="group flex items-start gap-4 p-5 transition-colors hover:bg-muted/40 sm:p-6"
                  >
                    <FolderKanban className="mt-1 size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="break-words font-medium">
                          {project.title}
                        </h3>
                        <WorkflowStatus status={project.workflow_status} />
                      </div>
                      {project.description && (
                        <p className="mt-2 line-clamp-2 break-words text-sm leading-6 text-muted-foreground">
                          {project.description}
                        </p>
                      )}
                      <p className="mt-3 text-xs text-muted-foreground">
                        {t(($) => $.workflow.executor)}
                        {" · "}
                        {project.lead_id &&
                        (project.lead_type === "member" ||
                          project.lead_type === "agent")
                          ? getActorName(project.lead_type, project.lead_id)
                          : t(($) => $.workflow.unassigned)}
                      </p>
                    </div>
                    <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </AppLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
