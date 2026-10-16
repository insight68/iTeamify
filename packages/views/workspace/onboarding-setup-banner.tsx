"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, X } from "lucide-react";
import { Button } from "@iteamify/ui/components/ui/button";
import { useCurrentUser } from "@iteamify/core/profile";
import { paths, useCurrentWorkspace } from "@iteamify/core/paths";
import { agentListOptions } from "@iteamify/core/workspace/queries";
import { runtimeListOptions } from "@iteamify/core/runtimes/queries";
import { useNavigation } from "../navigation";
import { useT } from "../i18n";

/** Resume setup without creating content or blocking the workspace. */
export function OnboardingSetupBanner() {
  const { t } = useT("onboarding");
  const { push } = useNavigation();
  const user = useCurrentUser().data;
  const workspace = useCurrentWorkspace();
  const [dismissed, setDismissed] = useState(false);
  const agents = useQuery({ ...agentListOptions(workspace?.id ?? ""), enabled: !!workspace && !!user?.onboarded_at });
  const runtimes = useQuery({ ...runtimeListOptions(workspace?.id ?? ""), enabled: !!workspace && !!user?.onboarded_at });
  if (dismissed || !workspace || !user?.onboarded_at || !agents.isSuccess || !runtimes.isSuccess) return null;
  const ready = agents.data.some((agent) => !agent.archived_at && runtimes.data.some((runtime) => runtime.id === agent.runtime_id && runtime.status === "online"));
  const questionnaire = user.onboarding_questionnaire ?? {};
  const profileMissing = !questionnaire.role && !questionnaire.role_skipped;
  if (ready && !profileMissing) return null;
  const step = ready ? "profile" : "assistant";
  return <aside className="fixed bottom-5 left-1/2 z-40 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center gap-3 rounded-xl border bg-background p-4 shadow-lg" aria-label={t(($) => $.setup_banner.label)}>
    <Bot className="size-5 shrink-0 text-primary" />
    <p className="min-w-0 flex-1 text-sm">{ready ? t(($) => $.setup_banner.profile) : t(($) => $.setup_banner.assistant)}</p>
    <Button size="sm" onClick={() => push(paths.onboarding(step, workspace.id))}>{t(($) => $.setup_banner.continue)}</Button>
    <Button variant="ghost" size="icon" aria-label={t(($) => $.common.close)} onClick={() => setDismissed(true)}><X className="size-4" /></Button>
  </aside>;
}
