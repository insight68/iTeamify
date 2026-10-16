"use client";

import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@iteamify/ui/components/ui/button";
import { Input } from "@iteamify/ui/components/ui/input";
import { Textarea } from "@iteamify/ui/components/ui/textarea";
import { Label } from "@iteamify/ui/components/ui/label";
import { DragStrip } from "@iteamify/views/platform";
import type { QuestionnaireAnswers } from "@iteamify/core/onboarding";
import { StepHeader } from "../components/step-header";
import { useT } from "../../i18n";

export function StepFirstTask({
  agentName, answers, title, description, pending, submitted, locked, error,
  onChange, onSubmit, onSkip, onBack,
}: {
  agentName: string; answers: QuestionnaireAnswers; title: string; description: string;
  pending: boolean; submitted: boolean; error: string;
  locked?: boolean;
  onChange: (patch: { taskTitle: string; taskDescription: string }) => void;
  onSubmit: () => void; onSkip: () => void; onBack: () => void;
}) {
  const { t } = useT("onboarding");
  const initialized = useRef(false);
  const recommended = answers.use_case.includes("ship_code") ? "code"
    : answers.use_case.includes("write_publish") ? "content"
    : answers.use_case.includes("plan_research") ? "research" : "plan";
  const examples = [recommended, ...(["plan", "code", "content", "research"] as const).filter((item) => item !== recommended)].slice(0, 3) as ("plan" | "code" | "content" | "research")[];
  const pick = (key: (typeof examples)[number]) => onChange({
    taskTitle: t(($) => $.step_task.examples[key].title),
    taskDescription: t(($) => $.step_task.examples[key].description),
  });
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (!title && !description && !submitted) pick(recommended);
  });

  return <div className="flex h-full min-h-0 flex-col bg-background">
    <DragStrip />
    <header className="flex shrink-0 items-center gap-4 px-6 py-3 sm:px-10 md:px-14 lg:px-16">
      <Button variant="ghost" size="sm" onClick={onBack} disabled={pending || submitted || locked}><ArrowLeft className="size-4" />{t(($) => $.common.back)}</Button>
      <div className="flex-1"><StepHeader currentStep="task" /></div>
    </header>
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-10 lg:py-14">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t(($) => $.step_header.labels.task)}</p>
        <h1 className="font-serif text-4xl font-medium tracking-tight">{t(($) => $.step_task.title)}</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{t(($) => $.step_task.description, { name: agentName })}</p>
        {submitted ? <p role="status" className="mt-8 rounded-lg border bg-muted/40 p-5">{t(($) => $.step_task.submitted)}</p> : <>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {examples.map((key) => <Button key={key} variant="outline" className="h-auto justify-start whitespace-normal px-4 py-4 text-left" disabled={pending || locked} onClick={() => pick(key)}>
              <Sparkles className="size-4 shrink-0" />{t(($) => $.step_task.examples[key].title)}
            </Button>)}
          </div>
          <fieldset disabled={pending || locked} className="mt-8 space-y-5">
            <div className="space-y-2"><Label htmlFor="onboarding-task-title">{t(($) => $.step_task.title_label)}</Label>
              <Input id="onboarding-task-title" value={title} maxLength={500} onChange={(event) => onChange({ taskTitle: event.target.value, taskDescription: description })} /></div>
            <div className="space-y-2"><Label htmlFor="onboarding-task-description">{t(($) => $.step_task.description_label)}</Label>
              <Textarea id="onboarding-task-description" value={description} rows={6} onChange={(event) => onChange({ taskTitle: title, taskDescription: event.target.value })} /></div>
          </fieldset>
        </>}
        {error && <p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}
        {locked && !submitted && error && <p className="mt-2 text-sm text-muted-foreground">{t(($) => $.step_task.recovering)}</p>}
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          {!submitted && <Button variant="secondary" disabled={pending} onClick={onSkip}>{t(($) => $.step_task.skip)}</Button>}
          <Button disabled={pending || (!submitted && (!title.trim() || !description.trim()))} onClick={onSubmit}>
            {pending && <Loader2 className="size-4 animate-spin" />}{submitted ? t(($) => $.step_task.open_task) : t(($) => $.step_task.submit)}<ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </main>
  </div>;
}
