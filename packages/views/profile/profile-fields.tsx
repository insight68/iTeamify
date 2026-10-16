"use client";

import { Input } from "@iteamify/ui/components/ui/input";
import { Textarea } from "@iteamify/ui/components/ui/textarea";
import { Label } from "@iteamify/ui/components/ui/label";
import { MAX_PROFILE_DESCRIPTION_LEN, type PersonalProfile } from "@iteamify/core/profile";
import { isImeComposing } from "@iteamify/core/utils";
import { AvatarUploadControl } from "../common/avatar-upload-control";
import { useT } from "../i18n";

/** Shared profile fields; free-text roles use the existing custom-role slot. */
export function ProfileFields({ value, onChange, disabled = false, compact = false, onConfirm, onAvatarUploaded }: {
  value: PersonalProfile; onChange: (patch: Partial<PersonalProfile>) => void;
  disabled?: boolean; compact?: boolean; onConfirm?: () => void;
  onAvatarUploaded: (url: string) => Promise<void>;
}) {
  const { t } = useT("onboarding");
  const { t: settingsT } = useT("settings");
  const roleText = value.role === "other" ? value.role_other ?? ""
    : value.role ? t(($) => $.questions.role[value.role!]) : "";
  const description = <div className="space-y-2">
    <Label htmlFor="profile-description">{settingsT(($) => $.account.profile_description_label)}</Label>
    <p className="text-sm text-muted-foreground">{settingsT(($) => $.account.profile_description_hint)}</p>
    <Textarea id="profile-description" value={value.profile_description} maxLength={MAX_PROFILE_DESCRIPTION_LEN}
      rows={4} onChange={(event) => onChange({ profile_description: event.target.value })}
      placeholder={settingsT(($) => $.account.profile_description_placeholder)} />
    <p className="text-right text-xs text-muted-foreground">{value.profile_description.length}/{MAX_PROFILE_DESCRIPTION_LEN}</p>
  </div>;
  return <fieldset disabled={disabled} className="min-w-0 space-y-8">
    <div className="flex items-center gap-5">
      <AvatarUploadControl variant="user" value={value.avatar_url || null} name={value.name} size={56} onUploaded={onAvatarUploaded} />
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="profile-name">{settingsT(($) => $.account.name_label)}</Label>
        <Input id="profile-name" autoComplete="name" value={value.name} onChange={(event) => onChange({ name: event.target.value })} />
      </div>
    </div>
    <div className="space-y-2">
      <Label htmlFor="profile-role">{t(($) => $.questions.role.question)}</Label>
      <Input id="profile-role" value={roleText} maxLength={MAX_PROFILE_DESCRIPTION_LEN} aria-describedby="profile-role-hint"
        onChange={(event) => onChange({ role: event.target.value ? "other" : null, role_other: event.target.value || null, role_skipped: false })}
        onKeyDown={(event) => { if (event.key === "Enter" && !isImeComposing(event)) onConfirm?.(); }} />
      <p id="profile-role-hint" className="text-sm text-muted-foreground">{t(($) => $.questions.about_you.role_hint)}</p>
    </div>
    {compact ? <details open={!!value.profile_description || undefined} className="text-sm">
      <summary className="cursor-pointer text-muted-foreground">{settingsT(($) => $.account.profile_description_label)} · {t(($) => $.common.optional)}</summary>
      <div className="mt-4">{description}</div>
    </details> : description}
  </fieldset>;
}
