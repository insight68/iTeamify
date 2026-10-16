"use client";

import {
  useCreateProject,
  useProjectDraftStore,
} from "@iteamify/core/projects";
import { useWorkspacePaths } from "@iteamify/core/paths";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@iteamify/ui/components/ui/dialog";
import { ProjectBriefForm } from "../projects/components/project-brief-form";
import { useNavigation } from "../navigation";
import { useT } from "../i18n";

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const { t } = useT("projects");
  const create = useCreateProject();
  const paths = useWorkspacePaths();
  const navigation = useNavigation();
  const draft = useProjectDraftStore((s) => s.draft);
  const setDraft = useProjectDraftStore((s) => s.setDraft);
  const clearDraft = useProjectDraftStore((s) => s.clearDraft);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !create.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t(($) => $.workflow.create)}</DialogTitle>
          <DialogDescription>
            {t(($) => $.workflow.create_hint)}
          </DialogDescription>
        </DialogHeader>
        <ProjectBriefForm
          initial={{
            title: draft.title,
            description: draft.description,
            acceptance_criteria: draft.acceptanceCriteria ?? "",
          }}
          onChange={(brief) =>
            setDraft({
              title: brief.title,
              description: brief.description,
              acceptanceCriteria: brief.acceptance_criteria,
            })
          }
          pending={create.isPending}
          submitLabel={t(($) => $.workflow.create)}
          onCancel={onClose}
          onSubmit={(brief) =>
            create.mutate(brief, {
              onSuccess: (project) => {
                clearDraft();
                onClose();
                navigation.push(paths.projectDetail(project.id));
              },
            })
          }
        />
        {create.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t(($) => $.workflow.error)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
