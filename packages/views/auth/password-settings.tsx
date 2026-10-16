"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePasswordActions, usePasswordStatus, useAuthStore, type AuthChallenge, type AuthProof } from "@iteamify/core/auth";
import { useConfigStore } from "@iteamify/core/config";
import { Button } from "@iteamify/ui/components/ui/button";
import { Input } from "@iteamify/ui/components/ui/input";
import { Label } from "@iteamify/ui/components/ui/label";
import { toast } from "sonner";
import { useT } from "../i18n";
import { PasswordField } from "./password-field";
import { retryAfterSeconds, useAuthErrorMessage } from "./auth-error";

export function PasswordSettings({ onSaved }: { onSaved?: () => void }) {
  const { t, i18n } = useT("auth");
  const enabled = useConfigStore((state) => state.passwordAuthEnabled);
  const email = useAuthStore((state) => state.user?.email ?? "");
  const status = usePasswordStatus();
  const actions = usePasswordActions();
  const id = useId();
  const busy = useRef(false);
  const [editing, setEditing] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);
  const [proof, setProof] = useState<AuthProof | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [error, setError] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const authError = useAuthErrorMessage();
  const language = i18n.resolvedLanguage === "zh-Hans" ? "zh-Hans" : "en";
  const pending = actions.requestCode.isPending || actions.verifyCode.isPending || actions.save.isPending || actions.reset.isPending;
  const hasPassword = status.data?.has_password === true;
  const needsVerification = !hasPassword || recovering;

  useEffect(() => {
    if (!cooldownUntil) return;
    const tick = () => setCooldown(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  const clear = () => {
    setEditing(false);
    setRecovering(false);
    setChallenge(null);
    setProof(null);
    setCode("");
    setPassword("");
    setCurrentPassword("");
    setError("");
  };
  const report = (error: unknown) => {
    setError(authError(error));
    const seconds = retryAfterSeconds(error);
    if (seconds !== undefined) setCooldownUntil(Date.now() + seconds * 1000);
  };
  const send = async () => {
    if (busy.current || cooldown > 0) return;
    busy.current = true;
    setError("");
    try {
      const result = await actions.requestCode.mutateAsync({ email, language, purpose: recovering ? "reset" : "set_password" });
      setChallenge(result);
      setCode("");
      setCooldownUntil(Date.now() + result.retry_after_seconds * 1000);
    } catch (error) { report(error); }
    finally { busy.current = false; }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setError("");
    try {
      if (needsVerification && !proof) {
        if (!challenge) return;
        const purpose = recovering ? "reset" : "set_password";
        const result = await actions.verifyCode.mutateAsync({ email, challenge_id: challenge.challenge_id, code, purpose });
        if (result.action !== purpose) throw new Error(t(($) => $.password_errors.unavailable));
        setProof({ email, purpose, challenge_id: challenge.challenge_id, proof: result.proof });
        setCode("");
      } else {
        if (recovering && proof) await actions.reset.mutateAsync({ ...proof, password, language });
        else await actions.save.mutateAsync({ ...proof, password, current_password: hasPassword ? currentPassword : undefined, language });
        clear();
        toast.success(recovering ? t(($) => $.password.reset_done) : t(($) => $.password.updated));
        onSaved?.();
      }
    } catch (error) { report(error); }
    finally { busy.current = false; }
  };

  if (!enabled) return null;
  if (status.isPending) return <p className="text-sm text-muted-foreground">{t(($) => $.password.status_loading)}</p>;
  if (status.isError) return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-destructive">{t(($) => $.password.status_failed)}</p>
      <Button variant="outline" onClick={() => status.refetch()} disabled={status.isFetching}>{t(($) => $.password.retry)}</Button>
    </div>
  );

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">{recovering ? t(($) => $.password.reset_warning) : hasPassword ? t(($) => $.password.settings_change_description) : t(($) => $.password.settings_set_description)}</p>
      {!editing ? (
        <Button variant="outline" onClick={() => setEditing(true)}>{hasPassword ? t(($) => $.password.change) : t(($) => $.password.set)}</Button>
      ) : (
        <form onSubmit={submit} className="max-w-md space-y-4">
          <input type="hidden" name="username" autoComplete="username" value={email} />
          {needsVerification && !proof ? (
            <div className="space-y-3">
              <p className="text-sm">{t(($) => $.password.verification_description, { email })}</p>
              <Button type="button" variant="outline" disabled={pending || cooldown > 0} onClick={send}>
                {cooldown > 0 ? t(($) => $.verify.resend_cooldown, { seconds: cooldown }) : challenge ? t(($) => $.verify.resend) : t(($) => $.password.send)}
              </Button>
              {challenge && (
                <div className="space-y-2">
                  <Label htmlFor={`${id}-code`}>{t(($) => $.password.code_label)}</Label>
                  <Input id={`${id}-code`} name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} disabled={pending} required autoFocus />
                </div>
              )}
            </div>
          ) : (
            <>
              {hasPassword && !recovering && (
                <div className="space-y-2">
                  <Label htmlFor={`${id}-current`}>{t(($) => $.password.current_label)}</Label>
                  <PasswordField id={`${id}-current`} name="current-password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={pending} required autoFocus />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor={`${id}-new`}>{t(($) => $.password.new_label)}</Label>
                <PasswordField id={`${id}-new`} name="new-password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={pending} required autoFocus={needsVerification} aria-describedby={`${id}-policy`} />
                <p id={`${id}-policy`} className="text-xs leading-5 text-muted-foreground">{t(($) => $.password.policy)}</p>
              </div>
            </>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            {(!needsVerification || proof || challenge) && <Button type="submit" disabled={pending || (needsVerification && !proof ? code.length !== 6 : Array.from(password).length < 10 || Array.from(password).length > 128 || (hasPassword && !recovering && !currentPassword))}>{pending ? t(($) => $.password.saving) : needsVerification && !proof ? t(($) => $.password.verify_code) : t(($) => $.password.save)}</Button>}
            <Button type="button" variant="ghost" disabled={pending} onClick={clear}>{t(($) => $.password.cancel)}</Button>
          </div>
          {hasPassword && !recovering && <Button type="button" variant="link" disabled={pending} onClick={() => { setRecovering(true); setPassword(""); setCurrentPassword(""); setError(""); }}>{t(($) => $.password.forgot)}</Button>}
        </form>
      )}
    </div>
  );
}
