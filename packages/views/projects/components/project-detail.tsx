"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, CheckCircle2, UserRound } from "lucide-react";
import { ApiError } from "@iteamify/core/api";
import {
  projectWorkflowOptions,
  useProjectWorkflowAction,
  type ProjectWorkflowAction,
} from "@iteamify/core/projects";
import { useWorkspaceId } from "@iteamify/core/hooks";
import { useWorkspacePaths } from "@iteamify/core/paths";
import {
  memberListOptions,
  agentListOptions,
} from "@iteamify/core/workspace/queries";
import { useActorName } from "@iteamify/core/workspace/hooks";
import { Button } from "@iteamify/ui/components/ui/button";
import { Markdown } from "@iteamify/ui/markdown";
import { Label } from "@iteamify/ui/components/ui/label";
import { Textarea } from "@iteamify/ui/components/ui/textarea";
import { BreadcrumbHeader } from "../../layout/breadcrumb-header";
import { useT } from "../../i18n";
import { ProjectBriefForm } from "./project-brief-form";
import { ProjectResourcesSection } from "./project-resources-section";
import { WorkflowStatus } from "./workflow-status";

export function ProjectDetail({ projectId }: { projectId: string }) {
  const { t } = useT("projects");
  const wsId = useWorkspaceId();
  const paths = useWorkspacePaths();
  const query = useQuery(projectWorkflowOptions(wsId, projectId));
  const project = query.data;
  const mutation = useProjectWorkflowAction(wsId, projectId);
  const members = useQuery(memberListOptions(wsId));
  const agents = useQuery(agentListOptions(wsId));
  const { getActorName } = useActorName();
  const [target, setTarget] = useState("");
  const [result, setResult] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const act = (input: Omit<ProjectWorkflowAction, "version">) => {
    if (project && !mutation.isPending)
      mutation.mutate(
        { ...input, version: project.version },
        {
          onSuccess: () => {
            setEditing(false);
            setResult("");
            setNote("");
          },
        },
      );
  };
  return (
    <main className="flex h-full min-h-0 flex-col">
      <BreadcrumbHeader
        segments={[
          {
            href: paths.applications(),
            label: t(($) => $.workflow.applications),
          },
          { href: paths.projects(), label: t(($) => $.page.title) },
        ]}
        leaf={
          <span className="truncate font-medium">
            {project?.title ?? t(($) => $.detail.breadcrumb_fallback)}
          </span>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
          {query.isPending ? (
            <p role="status" className="py-12 text-sm text-muted-foreground">
              {t(($) => $.workflow.loading)}
            </p>
          ) : query.isError || !project ? (
            <div role="alert" className="space-y-3">
              <p>{t(($) => $.workflow.load_error)}</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                {t(($) => $.workflow.reload)}
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <p className="text-xs tracking-wide text-muted-foreground">
                  {t(($) => $.workflow.flow)}
                </p>
                <div className="flex flex-wrap items-start gap-3">
                  <h1 className="min-w-0 flex-1 break-words text-2xl font-semibold tracking-tight">
                    {project.title}
                  </h1>
                  <WorkflowStatus status={project.workflow_status} />
                </div>
              </div>
              {mutation.isError && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
                >
                  {mutation.error instanceof ApiError &&
                  mutation.error.status === 409
                    ? t(($) => $.workflow.conflict)
                    : mutation.error instanceof ApiError &&
                        mutation.error.status === 503
                      ? t(($) => $.workflow.dispatch_error)
                      : t(($) => $.workflow.error)}
                </p>
              )}
              <section className="space-y-5 rounded-xl border p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">
                    {t(($) => $.workflow.brief)}
                  </h2>
                  {project.can_manage === true &&
                    project.workflow_status === "planned" &&
                    !editing && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(true)}
                      >
                        {t(($) => $.workflow.edit)}
                      </Button>
                    )}
                </div>
                {editing ? (
                  <ProjectBriefForm
                    key={projectId}
                    initial={{
                      title: project.title,
                      description: project.description ?? "",
                      acceptance_criteria: project.acceptance_criteria,
                    }}
                    pending={mutation.isPending}
                    submitLabel={t(($) => $.workflow.save)}
                    onCancel={() => setEditing(false)}
                    onSubmit={(brief) => act({ action: "edit", ...brief })}
                  />
                ) : (
                  <>
                    <div>
                      <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                        {t(($) => $.workflow.goal)}
                      </h3>
                      <Markdown className="min-w-0 break-words text-sm">
                        {project.description || "—"}
                      </Markdown>
                    </div>
                    <div>
                      <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                        {t(($) => $.workflow.criteria)}
                      </h3>
                      <p className="whitespace-pre-wrap break-words text-sm leading-7">
                        {project.acceptance_criteria ||
                          t(($) => $.workflow.criteria_required)}
                      </p>
                    </div>
                  </>
                )}
                {project.can_manage === true &&
                  project.workflow_status === "planned" && (
                    <details className="border-t pt-4">
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        {t(($) => $.resources.section_header)}
                      </summary>
                      <div className="mt-4">
                        <ProjectResourcesSection projectId={projectId} />
                      </div>
                    </details>
                  )}
              </section>
              <section className="space-y-4 rounded-xl border p-5 sm:p-6">
                <h2 className="font-semibold">
                  {t(($) => $.workflow.executor)}
                </h2>
                {project.lead_id ? (
                  <div className="flex items-center gap-3 text-sm">
                    {project.lead_type === "agent" ? (
                      <Bot className="size-5 text-muted-foreground" />
                    ) : (
                      <UserRound className="size-5 text-muted-foreground" />
                    )}
                    <span className="min-w-0 break-words">
                      {project.lead_type === "agent" ||
                      project.lead_type === "member"
                        ? getActorName(project.lead_type, project.lead_id)
                        : t(($) => $.workflow.unassigned)}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t(($) => $.workflow.unassigned)}
                  </p>
                )}
                {project.can_manage === true &&
                  project.workflow_status === "planned" && (
                    <form
                      className="flex flex-wrap items-end gap-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const [kind, id] = target.split(":");
                        if (id && (kind === "member" || kind === "agent"))
                          act({
                            action: "assign",
                            assignee_type: kind,
                            assignee_id: id,
                          });
                      }}
                    >
                      <div className="min-w-0 flex-1 space-y-2">
                        <Label htmlFor="project-executor">
                          {t(($) => $.workflow.choose_executor)}
                        </Label>
                        <select
                          id="project-executor"
                          className="h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
                          value={target}
                          disabled={
                            mutation.isPending ||
                            members.isPending ||
                            agents.isPending
                          }
                          onChange={(e) => setTarget(e.target.value)}
                          required
                        >
                          <option value="">
                            {t(($) => $.workflow.choose_executor)}
                          </option>
                          <optgroup label={t(($) => $.workflow.members)}>
                            {(members.data ?? []).map((m) => (
                              <option
                                key={m.user_id}
                                value={`member:${m.user_id}`}
                              >
                                {m.name || m.email}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label={t(($) => $.workflow.agents)}>
                            {(agents.data ?? [])
                              .filter((a) => !a.archived_at)
                              .map((a) => (
                                <option key={a.id} value={`agent:${a.id}`}>
                                  {a.name}
                                </option>
                              ))}
                          </optgroup>
                        </select>
                      </div>
                      <Button
                        type="submit"
                        disabled={
                          mutation.isPending ||
                          !target ||
                          !project.acceptance_criteria.trim()
                        }
                      >
                        {t(($) => $.workflow.assign)}
                      </Button>
                    </form>
                  )}
                {project.can_manage === true &&
                  project.workflow_status === "in_progress" &&
                  project.lead_type === "agent" &&
                  project.execution_active !== true && (
                    <div className="space-y-3 border-t pt-4">
                      <p className="text-xs text-muted-foreground">
                        {t(($) => $.workflow.retry_hint)}
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mutation.isPending}
                        onClick={() => act({ action: "retry" })}
                      >
                        {t(($) => $.workflow.retry)}
                      </Button>
                    </div>
                  )}
              </section>
              {project.workflow_status !== "planned" && (
                <section className="space-y-4 rounded-xl border p-5 sm:p-6">
                  <h2 className="font-semibold">
                    {t(($) => $.workflow.result)}
                  </h2>
                  {project.review_note && (
                    <div className="rounded-lg bg-muted p-4">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">
                        {project.workflow_status === "completed"
                          ? t(($) => $.workflow.note)
                          : t(($) => $.workflow.changes_requested)}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">
                        {project.review_note}
                      </p>
                    </div>
                  )}
                  {project.result ? (
                    <Markdown className="min-w-0 break-words text-sm">
                      {project.result}
                    </Markdown>
                  ) : (
                    <p className="text-sm leading-6 text-muted-foreground">
                      {project.workflow_status === "in_progress"
                        ? t(($) => $.workflow.waiting_result)
                        : t(($) => $.workflow.no_results)}
                    </p>
                  )}
                  {project.can_submit === true &&
                    project.workflow_status === "in_progress" && (
                      <form
                        className="space-y-3 border-t pt-4"
                        onSubmit={(e) => {
                          e.preventDefault();
                          act({ action: "submit", result });
                        }}
                      >
                        <Label htmlFor="project-result">
                          {t(($) => $.workflow.result)}
                        </Label>
                        <Textarea
                          id="project-result"
                          value={result}
                          onChange={(e) => setResult(e.target.value)}
                          maxLength={50000}
                          rows={6}
                          required
                          disabled={mutation.isPending}
                          placeholder={t(($) => $.workflow.result_hint)}
                        />
                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            disabled={
                              mutation.isPending ||
                              project.execution_active === true ||
                              !result.trim()
                            }
                          >
                            {t(($) => $.workflow.submit)}
                          </Button>
                        </div>
                      </form>
                    )}
                </section>
              )}
              {project.workflow_status === "in_review" && (
                <section className="space-y-4 rounded-xl border border-warning/30 p-5 sm:p-6">
                  <h2 className="font-semibold">
                    {t(($) => $.workflow.review)}
                  </h2>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {t(($) => $.workflow.review_hint)}
                  </p>
                  {project.can_review === true && (
                    <>
                      <Label htmlFor="project-review">
                        {t(($) => $.workflow.note)}
                      </Label>
                      <Textarea
                        id="project-review"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={20000}
                        rows={3}
                        placeholder={t(($) => $.workflow.note_hint)}
                        disabled={mutation.isPending}
                      />
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          disabled={
                            mutation.isPending ||
                            project.execution_active === true ||
                            !note.trim()
                          }
                          onClick={() => act({ action: "reject", note })}
                        >
                          {t(($) => $.workflow.reject)}
                        </Button>
                        <Button
                          disabled={
                            mutation.isPending ||
                            project.execution_active === true ||
                            !project.result.trim()
                          }
                          onClick={() =>
                            act({
                              action: "approve",
                              note,
                              result: project.result,
                            })
                          }
                        >
                          <CheckCircle2 className="size-4" />
                          {t(($) => $.workflow.approve)}
                        </Button>
                      </div>
                    </>
                  )}
                </section>
              )}
              {project.workflow_status === "completed" && (
                <div className="flex items-center gap-3 rounded-xl border p-5 text-sm">
                  <CheckCircle2 className="size-5 shrink-0 text-primary" />
                  {t(($) => $.workflow.accepted_hint)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
