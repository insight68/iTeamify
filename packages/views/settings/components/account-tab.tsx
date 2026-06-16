"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, KeyRound, Loader2, Save } from "lucide-react";
import { Input } from "@teamify/ui/components/ui/input";
import { Label } from "@teamify/ui/components/ui/label";
import { Button } from "@teamify/ui/components/ui/button";
import { Card, CardContent } from "@teamify/ui/components/ui/card";
import { toast } from "sonner";
import { useAuthStore } from "@teamify/core/auth";
import { api } from "@teamify/core/api";
import { useFileUpload } from "@teamify/core/hooks/use-file-upload";
import { useT } from "../../i18n";

type ChangeStep = "idle" | "awaiting-code" | "verifying";

export function AccountTab() {
  const { t } = useT("settings");
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const refreshMe = useAuthStore((s) => s.refreshMe);

  const [profileName, setProfileName] = useState(user?.name ?? "");
  const [profileSaving, setProfileSaving] = useState(false);
  const { upload, uploading } = useFileUpload(api);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password state
  const hasPassword = user?.has_password === true;
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [settingPassword, setSettingPassword] = useState(false);

  // Change password flow
  const [changeStep, setChangeStep] = useState<ChangeStep>("idle");
  const [changeCode, setChangeCode] = useState("");
  const [changeNewPassword, setChangeNewPassword] = useState("");
  const [changeConfirmPassword, setChangeConfirmPassword] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    setProfileName(user?.name ?? "");
  }, [user]);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  const initials = (user?.name ?? "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    try {
      const result = await upload(file);
      if (!result) return;
      const updated = await api.updateMe({ avatar_url: result.link });
      setUser(updated);
      toast.success(t(($) => $.account.toast_avatar_updated));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t(($) => $.account.toast_avatar_failed));
    }
  };

  const handleProfileSave = async () => {
    setProfileSaving(true);
    try {
      const updated = await api.updateMe({ name: profileName });
      setUser(updated);
      toast.success(t(($) => $.account.toast_profile_updated));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(($) => $.account.toast_profile_failed));
    } finally {
      setProfileSaving(false);
    }
  };

  const validatePasswords = useCallback(
    (pw: string, confirm: string): string | null => {
      if (pw.length < 8) return t(($) => $.account.password_error_too_short);
      if (pw !== confirm) return t(($) => $.account.password_error_mismatch);
      return null;
    },
    [t],
  );

  const handleSetPassword = async () => {
    const error = validatePasswords(newPassword, confirmPassword);
    if (error) {
      toast.error(error);
      return;
    }
    setSettingPassword(true);
    try {
      await api.setPassword(newPassword);
      toast.success(t(($) => $.account.toast_password_set));
      setNewPassword("");
      setConfirmPassword("");
      await refreshMe();
    } catch {
      toast.error(t(($) => $.account.password_error_set_failed));
    } finally {
      setSettingPassword(false);
    }
  };

  const startCooldown = useCallback((seconds: number) => {
    setCooldown(seconds);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSendCode = useCallback(async () => {
    if (!user?.email) return;
    setSendingCode(true);
    try {
      await api.resetPasswordSendCode(user.email);
      setChangeStep("awaiting-code");
      toast.success(
        t(($) => $.account.password_code_sent, { email: user.email }),
      );
      startCooldown(60);
    } catch {
      toast.error(t(($) => $.account.password_error_change_failed));
    } finally {
      setSendingCode(false);
    }
  }, [user?.email, t, startCooldown]);

  const handleChangePassword = useCallback(async () => {
    if (!user?.email) return;
    if (!changeCode.trim()) {
      toast.error(t(($) => $.account.password_error_code_required));
      return;
    }
    const error = validatePasswords(changeNewPassword, changeConfirmPassword);
    if (error) {
      toast.error(error);
      return;
    }
    setChangingPassword(true);
    try {
      await api.resetPasswordVerify(user.email, changeCode, changeNewPassword);
      toast.success(t(($) => $.account.toast_password_changed));
      setChangeStep("idle");
      setChangeCode("");
      setChangeNewPassword("");
      setChangeConfirmPassword("");
      await refreshMe();
    } catch {
      toast.error(t(($) => $.account.password_error_change_failed));
    } finally {
      setChangingPassword(false);
    }
  }, [user?.email, changeCode, changeNewPassword, changeConfirmPassword, t, validatePasswords, refreshMe]);

  const resetChangeFlow = useCallback(() => {
    setChangeStep("idle");
    setChangeCode("");
    setChangeNewPassword("");
    setChangeConfirmPassword("");
  }, []);

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t(($) => $.account.section_profile)}</h2>

        <Card>
          <CardContent className="space-y-4">
            {/* Avatar upload */}
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="group relative h-16 w-16 shrink-0 rounded-full bg-muted overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">
                    {initials}
                  </span>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : (
                    <Camera className="h-5 w-5 text-white" />
                  )}
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <div className="text-xs text-muted-foreground">
                {t(($) => $.account.click_avatar_hint)}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">{t(($) => $.account.name_label)}</Label>
              <Input
                type="search"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t(($) => $.account.phone_label)}</Label>
              <Input
                type="tel"
                value={user?.phone ?? ""}
                placeholder={t(($) => $.account.phone_not_set)}
                readOnly
                disabled
                className="mt-1"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleProfileSave}
                disabled={profileSaving || !profileName.trim()}
              >
                <Save className="h-3 w-3" />
                {profileSaving ? t(($) => $.account.saving) : t(($) => $.account.save)}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Password section */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">{t(($) => $.account.section_password)}</h2>

        <Card>
          <CardContent className="space-y-4">
            {!hasPassword ? (
              <>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                  {t(($) => $.account.password_status_none)}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t(($) => $.account.password_new)}</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t(($) => $.account.password_new_placeholder)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t(($) => $.account.password_confirm)}</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t(($) => $.account.password_confirm_placeholder)}
                    className="mt-1"
                  />
                </div>
                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    onClick={handleSetPassword}
                    disabled={settingPassword || !newPassword || !confirmPassword}
                  >
                    {settingPassword
                      ? t(($) => $.account.password_setting)
                      : t(($) => $.account.password_set)}
                  </Button>
                </div>
              </>
            ) : changeStep === "idle" ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <KeyRound className="h-4 w-4" />
                    {t(($) => $.account.password_status_set)}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setChangeStep("awaiting-code")}
                  >
                    {t(($) => $.account.password_change)}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <KeyRound className="h-4 w-4" />
                    {t(($) => $.account.password_status_set)}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={resetChangeFlow}
                  >
                    {t(($) => $.account.password_change)}
                  </Button>
                </div>

                {/* Send code */}
                {changeStep === "awaiting-code" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleSendCode}
                        disabled={sendingCode || cooldown > 0}
                      >
                        {sendingCode
                          ? t(($) => $.account.password_sending_code)
                          : cooldown > 0
                            ? t(($) => $.account.password_resend_cooldown, { seconds: cooldown })
                            : t(($) => $.account.password_send_code)}
                      </Button>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        {t(($) => $.account.password_code_label)}
                      </Label>
                      <Input
                        value={changeCode}
                        onChange={(e) => setChangeCode(e.target.value)}
                        placeholder={t(($) => $.account.password_code_placeholder)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        {t(($) => $.account.password_new)}
                      </Label>
                      <Input
                        type="password"
                        value={changeNewPassword}
                        onChange={(e) => setChangeNewPassword(e.target.value)}
                        placeholder={t(($) => $.account.password_new_placeholder)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        {t(($) => $.account.password_confirm)}
                      </Label>
                      <Input
                        type="password"
                        value={changeConfirmPassword}
                        onChange={(e) => setChangeConfirmPassword(e.target.value)}
                        placeholder={t(($) => $.account.password_confirm_placeholder)}
                        className="mt-1"
                      />
                    </div>
                    <div className="flex justify-end pt-1">
                      <Button
                        size="sm"
                        onClick={handleChangePassword}
                        disabled={changingPassword || !changeCode || !changeNewPassword || !changeConfirmPassword}
                      >
                        {changingPassword
                          ? t(($) => $.account.password_changing)
                          : t(($) => $.account.password_change)}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
