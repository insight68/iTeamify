"use client";

import { toast } from "sonner";
import { profileValid, profilesEqual, useProfileForm, type PersonalProfile } from "@iteamify/core/profile";
import { useConfigStore } from "@iteamify/core/config";
import { ProfileFields } from "../../profile/profile-fields";
import { useT } from "../../i18n";
import { SettingsCard, SettingsSaveState, SettingsSection, SettingsTab } from "./settings-layout";
import { useAutoSave } from "./use-auto-save";
import { PasswordSettings } from "../../auth/password-settings";

const equalProfile = (left?: PersonalProfile, right?: PersonalProfile) => left === right || (!!left && !!right && profilesEqual(left, right));

export function AccountTab() {
  const { t } = useT("settings");
  const { t: authT } = useT("auth");
  const passwordEnabled = useConfigStore((state) => state.passwordAuthEnabled);
  const form = useProfileForm();
  const { value, saved } = form;
  const autoSave = useAutoSave({ value, savedValue: saved,
    onSave: async () => { await form.save(); },
    isEqual: equalProfile,
    enabled: !!value && profileValid(value),
    onError: (error) => toast.error(error instanceof Error ? error.message : t(($) => $.account.toast_profile_failed)),
  });
  return <SettingsTab title={t(($) => $.page.tabs.profile)}>
    <SettingsSection title={t(($) => $.account.section_profile)} action={<SettingsSaveState status={autoSave.status}
      savingLabel={t(($) => $.auto_save.saving)} savedLabel={t(($) => $.auto_save.saved)} errorLabel={t(($) => $.auto_save.failed)} />}>
      <SettingsCard><div className="p-5 sm:p-6" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) autoSave.flush(); }}>
        {value && <ProfileFields value={value} onChange={form.change} onAvatarUploaded={async (avatar_url) => {
          form.change({ avatar_url });
          await form.update.mutateAsync({ avatar_url });
        }} />}
      </div></SettingsCard>
    </SettingsSection>
    {passwordEnabled && <SettingsSection title={authT(($) => $.password.settings_title)}><SettingsCard><div className="p-4"><PasswordSettings /></div></SettingsCard></SettingsSection>}
  </SettingsTab>;
}
