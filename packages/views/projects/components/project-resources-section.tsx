"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  FileText,
  FolderGit,
  Globe,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  projectResourcesOptions,
  useCreateProjectResource,
  useDeleteProjectResource,
} from "@teamify/core/projects";
import { useWorkspaceId } from "@teamify/core/hooks";
import { useCurrentWorkspace } from "@teamify/core/paths";
import { getApi } from "@teamify/core/api";
import type {
  FileResourceRef,
  GithubRepoResourceRef,
  ProjectResource,
  TextResourceRef,
  UrlResourceRef,
} from "@teamify/core/types";
import { Button } from "@teamify/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@teamify/ui/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@teamify/ui/components/ui/tooltip";
import { useT } from "../../i18n";

type AddTab = "repo" | "link" | "file" | "text";

// Project Resources sidebar section.
//
// Renders github_repo, url, file, and text resource types. The rendering
// layer is type-dispatched so adding a new type means: (1) extend the API
// validator, (2) add a render case here. No changes to the schema or query
// layer.
export function ProjectResourcesSection({ projectId }: { projectId: string }) {
  const { t } = useT("projects");
  const wsId = useWorkspaceId();
  const workspace = useCurrentWorkspace();
  const [open, setOpen] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<AddTab>("repo");

  const { data: resources = [] } = useQuery(
    projectResourcesOptions(wsId, projectId),
  );
  const createResource = useCreateProjectResource(wsId, projectId);
  const deleteResource = useDeleteProjectResource(wsId, projectId);

  const attachedUrls = new Set(
    resources
      .filter((r) => r.resource_type === "github_repo")
      .map((r) => (r.resource_ref as GithubRepoResourceRef).url),
  );

  const handleAttachRepo = async (url: string) => {
    try {
      await createResource.mutateAsync({
        resource_type: "github_repo",
        resource_ref: { url },
      });
      toast.success(t(($) => $.resources.toast_attached));
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : t(($) => $.resources.toast_attach_failed);
      toast.error(msg);
    }
  };

  const handleAttachLink = async (url: string, title?: string) => {
    try {
      await createResource.mutateAsync({
        resource_type: "url",
        resource_ref: { url, title: title || undefined },
      });
      toast.success(t(($) => $.resources.toast_attached));
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : t(($) => $.resources.toast_attach_failed);
      toast.error(msg);
    }
  };

  const handleAttachFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t(($) => $.resources.toast_file_too_large));
      return;
    }
    try {
      const api = getApi();
      const att = await api.uploadFile(file);
      // Extract storage_key from the upload URL (path portion).
      const storageKey = att.url.replace(/^\/uploads\//, "").replace(/^https?:\/\/[^/]+\/uploads\//, "");
      await createResource.mutateAsync({
        resource_type: "file",
        resource_ref: {
          storage_key: storageKey || att.url,
          filename: att.filename,
          content_type: att.content_type,
          size_bytes: att.size_bytes,
        },
      });
      toast.success(t(($) => $.resources.toast_attached));
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : t(($) => $.resources.toast_attach_failed);
      toast.error(msg);
    }
  };

  const handleAttachText = async (
    content: string,
    filename?: string,
  ) => {
    try {
      await createResource.mutateAsync({
        resource_type: "text",
        resource_ref: {
          content,
          filename: filename || undefined,
        },
      });
      toast.success(t(($) => $.resources.toast_attached));
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : t(($) => $.resources.toast_attach_failed);
      toast.error(msg);
    }
  };

  const handleRemove = async (resource: ProjectResource) => {
    try {
      await deleteResource.mutateAsync(resource.id);
      toast.success(t(($) => $.resources.toast_removed));
    } catch {
      toast.error(t(($) => $.resources.toast_remove_failed));
    }
  };

  const tabs: { key: AddTab; label: string }[] = [
    { key: "repo", label: t(($) => $.resources.tab_repo) },
    { key: "link", label: t(($) => $.resources.tab_link) },
    { key: "file", label: t(($) => $.resources.tab_file) },
    { key: "text", label: t(($) => $.resources.tab_text) },
  ];

  return (
    <div>
      <button
        className={`flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors mb-2 hover:bg-accent/70 ${open ? "" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => setOpen(!open)}
      >
        {t(($) => $.resources.section_header)}
        <ChevronRight
          className={`!size-3 shrink-0 stroke-[2.5] text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="pl-2 space-y-1.5">
          {resources.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t(($) => $.resources.empty)}
            </p>
          )}
          {resources.map((resource) => (
            <ResourceRow
              key={resource.id}
              resource={resource}
              onRemove={() => handleRemove(resource)}
            />
          ))}
          <Popover open={addOpen} onOpenChange={setAddOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="size-3" />
                  {t(($) => $.resources.add_button)}
                </Button>
              }
            />
            <PopoverContent align="start" className="w-72 p-2 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">
                {t(($) => $.resources.popover_title)}
              </div>
              {/* Tab bar */}
              <div className="flex gap-0.5 border-b pb-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setAddTab(tab.key)}
                    className={`px-2 py-1 text-xs rounded-sm transition-colors ${
                      addTab === tab.key
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {/* Tab content */}
              {addTab === "repo" && (
                <RepoTab
                  workspace={workspace}
                  attachedUrls={attachedUrls}
                  isDisabled={createResource.isPending}
                  onAttach={async (url) => {
                    await handleAttachRepo(url);
                    setAddOpen(false);
                  }}
                />
              )}
              {addTab === "link" && (
                <LinkForm
                  onSubmit={async (url, title) => {
                    await handleAttachLink(url, title);
                    setAddOpen(false);
                  }}
                />
              )}
              {addTab === "file" && (
                <FileForm
                  onSubmit={async (file) => {
                    await handleAttachFile(file);
                    setAddOpen(false);
                  }}
                />
              )}
              {addTab === "text" && (
                <TextForm
                  onSubmit={async (content, filename) => {
                    await handleAttachText(content, filename);
                    setAddOpen(false);
                  }}
                />
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
}

function ResourceRow({
  resource,
  onRemove,
}: {
  resource: ProjectResource;
  onRemove: () => void;
}) {
  const { t } = useT("projects");
  switch (resource.resource_type) {
    case "github_repo": {
      const ref = resource.resource_ref as GithubRepoResourceRef;
      return (
        <div className="flex items-center gap-2 text-xs group">
          <FolderGit className="size-3.5 text-muted-foreground shrink-0" />
          <Tooltip>
            <TooltipTrigger
              render={
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate flex-1 hover:underline"
                >
                  {resource.label || ref.url}
                </a>
              }
            />
            <TooltipContent side="top">{ref.url}</TooltipContent>
          </Tooltip>
          <button
            type="button"
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded-sm p-0.5 hover:bg-accent"
            title={t(($) => $.resources.remove_tooltip)}
          >
            <Trash2 className="size-3 text-muted-foreground" />
          </button>
        </div>
      );
    }
    case "url": {
      const ref = resource.resource_ref as UrlResourceRef;
      return (
        <div className="flex items-center gap-2 text-xs group">
          <Globe className="size-3.5 text-muted-foreground shrink-0" />
          <Tooltip>
            <TooltipTrigger
              render={
                <a
                  href={ref.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate flex-1 hover:underline"
                >
                  {resource.label || ref.title || ref.url}
                </a>
              }
            />
            <TooltipContent side="top">{ref.url}</TooltipContent>
          </Tooltip>
          <button
            type="button"
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded-sm p-0.5 hover:bg-accent"
            title={t(($) => $.resources.remove_tooltip)}
          >
            <Trash2 className="size-3 text-muted-foreground" />
          </button>
        </div>
      );
    }
    case "file": {
      const ref = resource.resource_ref as FileResourceRef;
      return (
        <div className="flex items-center gap-2 text-xs group">
          <Paperclip className="size-3.5 text-muted-foreground shrink-0" />
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="truncate flex-1">
                  {resource.label || ref.filename}
                  <span className="text-muted-foreground ml-1">
                    ({formatBytes(ref.size_bytes)})
                  </span>
                </span>
              }
            />
            <TooltipContent side="top">
              {ref.filename} ({formatBytes(ref.size_bytes)})
            </TooltipContent>
          </Tooltip>
          <button
            type="button"
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded-sm p-0.5 hover:bg-accent"
            title={t(($) => $.resources.remove_tooltip)}
          >
            <Trash2 className="size-3 text-muted-foreground" />
          </button>
        </div>
      );
    }
    case "text": {
      const ref = resource.resource_ref as TextResourceRef;
      const preview =
        ref.filename ||
        (ref.content.length > 50
          ? ref.content.slice(0, 50) + "..."
          : ref.content);
      return (
        <div className="flex items-center gap-2 text-xs group">
          <FileText className="size-3.5 text-muted-foreground shrink-0" />
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="truncate flex-1">
                  {resource.label || preview}
                </span>
              }
            />
            <TooltipContent side="top">{preview}</TooltipContent>
          </Tooltip>
          <button
            type="button"
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 transition-opacity rounded-sm p-0.5 hover:bg-accent"
            title={t(($) => $.resources.remove_tooltip)}
          >
            <Trash2 className="size-3 text-muted-foreground" />
          </button>
        </div>
      );
    }
    default:
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate flex-1">
            {resource.label || resource.resource_type}
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-sm p-0.5 hover:bg-accent"
            title={t(($) => $.resources.remove_tooltip)}
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      );
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function RepoTab({
  workspace,
  attachedUrls,
  isDisabled,
  onAttach,
}: {
  workspace: ReturnType<typeof useCurrentWorkspace>;
  attachedUrls: Set<string>;
  isDisabled: boolean;
  onAttach: (url: string) => Promise<void> | void;
}) {
  const { t } = useT("projects");
  const [url, setUrl] = useState("");

  return (
    <>
      {workspace?.repos && workspace.repos.length > 0 && (
        <div className="space-y-1">
          {workspace.repos.map((repo) => {
            const isAttached = attachedUrls.has(repo.url);
            const disabled = isAttached || isDisabled;
            return (
              <button
                key={repo.url}
                type="button"
                aria-disabled={disabled}
                onClick={async () => {
                  if (disabled) return;
                  await onAttach(repo.url);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-left hover:bg-accent transition-colors aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:hover:bg-transparent"
              >
                <FolderGit className="size-3.5" />
                <Tooltip>
                  <TooltipTrigger
                    render={<span className="truncate flex-1">{repo.url}</span>}
                  />
                  <TooltipContent side="top">{repo.url}</TooltipContent>
                </Tooltip>
                {isAttached && (
                  <span className="text-[10px] text-muted-foreground">
                    {t(($) => $.resources.attached_badge)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const trimmed = url.trim();
          if (!trimmed) return;
          await onAttach(trimmed);
        }}
        className="flex items-center gap-1.5 pt-1 border-t"
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t(($) => $.resources.url_placeholder)}
          className="flex-1 bg-transparent text-xs px-2 py-1 outline-none placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs"
          disabled={!url.trim()}
        >
          {t(($) => $.resources.url_submit)}
        </Button>
      </form>
    </>
  );
}

function LinkForm({
  onSubmit,
}: {
  onSubmit: (url: string, title?: string) => Promise<void> | void;
}) {
  const { t } = useT("projects");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed, title.trim() || undefined);
      setUrl("");
      setTitle("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-1.5">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={t(($) => $.resources.link_url_placeholder)}
        className="w-full bg-transparent text-xs px-2 py-1.5 rounded-md border outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
      />
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t(($) => $.resources.link_title_placeholder)}
        className="w-full bg-transparent text-xs px-2 py-1.5 rounded-md border outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
      />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs w-full"
        disabled={!url.trim() || submitting}
      >
        {t(($) => $.resources.link_submit)}
      </Button>
    </form>
  );
}

function FileForm({
  onSubmit,
}: {
  onSubmit: (file: File) => Promise<void> | void;
}) {
  const { t } = useT("projects");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onSubmit(file);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-1.5">
      <input
        ref={inputRef}
        type="file"
        onChange={handleChange}
        className="hidden"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 px-2 text-xs w-full"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading
          ? t(($) => $.resources.file_uploading)
          : t(($) => $.resources.file_upload_label)}
      </Button>
    </div>
  );
}

function TextForm({
  onSubmit,
}: {
  onSubmit: (content: string, filename?: string) => Promise<void> | void;
}) {
  const { t } = useT("projects");
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed, filename.trim() || undefined);
      setContent("");
      setFilename("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-1.5">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={t(($) => $.resources.text_placeholder)}
        rows={4}
        className="w-full bg-transparent text-xs px-2 py-1.5 rounded-md border outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring resize-none"
      />
      <input
        type="text"
        value={filename}
        onChange={(e) => setFilename(e.target.value)}
        placeholder={t(($) => $.resources.text_filename_placeholder)}
        className="w-full bg-transparent text-xs px-2 py-1.5 rounded-md border outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
      />
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs w-full"
        disabled={!content.trim() || submitting}
      >
        {t(($) => $.resources.text_submit)}
      </Button>
    </form>
  );
}
