"use client";

import { useRef } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@iteamify/ui/components/ui/button";
import { useScrollFade } from "@iteamify/ui/hooks/use-scroll-fade";
import { profileValid, type PersonalProfile } from "@iteamify/core/profile";
import { DragStrip } from "@iteamify/views/platform";
import { StepHeader } from "../components/step-header";
import { ProfileFields } from "../../profile/profile-fields";
import { useT } from "../../i18n";

export function StepAboutYou({ value, onChange, onAdvance, onSkip, onAvatarUploaded, pending = false, error = "" }: {
  value: PersonalProfile; onChange: (patch: Partial<PersonalProfile>) => void;
  onAdvance: () => void; onSkip: () => void; onAvatarUploaded: (url: string) => Promise<void>;
  pending?: boolean; error?: string;
}) {
  const { t } = useT("onboarding");
  const mainRef = useRef<HTMLElement>(null);
  const fadeStyle = useScrollFade(mainRef);
  const valid = profileValid(value);
  return <div className="animate-onboarding-enter flex h-full min-h-0 flex-col bg-background">
    <DragStrip />
    <header className="shrink-0 px-6 py-3 sm:px-10 md:px-14 lg:px-16"><StepHeader currentStep="profile" /></header>
    <main ref={mainRef} style={fadeStyle} className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[920px] px-6 py-10 sm:px-10 md:px-14 lg:py-14">
        <p className="mb-2 text-xs font-medium text-muted-foreground">{t(($) => $.questions.eyebrow_about_you)}</p>
        <h1 className="text-balance font-serif text-[34px] font-medium leading-[1.15] tracking-tight">{t(($) => $.questions.about_you.question)}</h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{t(($) => $.questions.about_you.description)}</p>
        <div className="mt-8"><ProfileFields value={value} onChange={onChange} disabled={pending} compact onAvatarUploaded={onAvatarUploaded} onConfirm={() => { if (valid && !pending) onAdvance(); }} /></div>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <div className="mt-10 flex flex-wrap justify-end gap-3">
          <Button size="lg" variant="secondary" disabled={pending} onClick={onSkip}>{t(($) => $.common.later)}</Button>
          <Button size="lg" disabled={!valid || pending} onClick={onAdvance}>{t(($) => $.common.continue)}<ArrowRight className="size-4" /></Button>
        </div>
      </div>
    </main>
  </div>;
}
