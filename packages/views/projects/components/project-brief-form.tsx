"use client";

import { useState } from "react";
import { Button } from "@iteamify/ui/components/ui/button";
import { Input } from "@iteamify/ui/components/ui/input";
import { Label } from "@iteamify/ui/components/ui/label";
import { Textarea } from "@iteamify/ui/components/ui/textarea";
import { useT } from "../../i18n";

export interface ProjectBrief {
  title: string;
  description: string;
  acceptance_criteria: string;
}

export function ProjectBriefForm({
  initial,
  onChange,
  onSubmit,
  pending,
  submitLabel,
  onCancel,
}: {
  initial: ProjectBrief;
  onChange?: (brief: ProjectBrief) => void;
  onSubmit: (brief: ProjectBrief) => void;
  pending: boolean;
  submitLabel: string;
  onCancel?: () => void;
}) {
  const { t } = useT("projects");
  const [brief, setBrief] = useState(initial);
  const change = (key: keyof ProjectBrief, value: string) => {
    const next = { ...brief, [key]: value };
    setBrief(next);
    onChange?.(next);
  };
  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending && brief.title.trim() && brief.acceptance_criteria.trim())
          onSubmit({
            title: brief.title.trim(),
            description: brief.description.trim(),
            acceptance_criteria: brief.acceptance_criteria.trim(),
          });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="project-title">{t(($) => $.workflow.title)}</Label>
        <Input
          id="project-title"
          required
          maxLength={200}
          disabled={pending}
          value={brief.title}
          onChange={(e) => change("title", e.target.value)}
          autoFocus
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="project-goal">{t(($) => $.workflow.goal)}</Label>
        <Textarea
          id="project-goal"
          maxLength={20000}
          disabled={pending}
          value={brief.description}
          onChange={(e) => change("description", e.target.value)}
          rows={4}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="project-criteria">
          {t(($) => $.workflow.criteria)}
        </Label>
        <Textarea
          id="project-criteria"
          required
          maxLength={20000}
          disabled={pending}
          value={brief.acceptance_criteria}
          onChange={(e) => change("acceptance_criteria", e.target.value)}
          placeholder={t(($) => $.workflow.criteria_hint)}
          rows={4}
        />
      </div>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onCancel}
          >
            {t(($) => $.workflow.cancel)}
          </Button>
        )}
        <Button
          type="submit"
          disabled={
            pending || !brief.title.trim() || !brief.acceptance_criteria.trim()
          }
        >
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
