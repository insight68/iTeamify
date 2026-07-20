"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@teamify/ui/components/ui/card";
import { Input } from "@teamify/ui/components/ui/input";
import { Button } from "@teamify/ui/components/ui/button";
import { Label } from "@teamify/ui/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@teamify/ui/components/ui/input-otp";
import { api } from "@teamify/core/api";
import { useT } from "../i18n";

interface ResetPasswordPageProps {
  logo?: React.ReactNode;
  /** Called when the password reset is complete successfully. */
  onSuccess?: () => void;
  /** Called when user wants to go back to login. */
  onBack?: () => void;
}

type Step = "email" | "code" | "password";

export function ResetPasswordPage({ logo, onSuccess, onBack }: ResetPasswordPageProps) {
  const { t } = useT("auth");
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const handleSendCode = useCallback(async () => {
    if (!email) {
      setError(t(($) => $.common.email_required));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.resetPasswordSendCode(email);
      setStep("code");
      setCode("");
      setCooldown(60);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t(($) => $.errors.send_failed),
      );
    } finally {
      setLoading(false);
    }
  }, [email, t]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0) return;
    setError("");
    try {
      await api.resetPasswordSendCode(email);
      setCooldown(60);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t(($) => $.errors.resend_failed),
      );
    }
  }, [cooldown, email, t]);

  const handleVerifyCode = useCallback(
    async (value: string) => {
      if (value.length !== 6) return;
      setError("");
      setCode(value);
      setStep("password");
    },
    [],
  );

  const handleSubmitPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      if (password.length < 8) {
        setError(t(($) => $.reset_password.errors.password_too_short));
        return;
      }

      if (password !== confirmPassword) {
        setError(t(($) => $.reset_password.errors.password_mismatch));
        return;
      }

      if (code.length !== 6) {
        setError(t(($) => $.errors.code_invalid));
        return;
      }

      setLoading(true);
      try {
        await api.resetPasswordVerify(email, code, password);
        onSuccess?.();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t(($) => $.errors.code_invalid),
        );
      } finally {
        setLoading(false);
      }
    },
    [code, email, password, confirmPassword, t, onSuccess],
  );

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // --- Password step ---
  if (step === "password") {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            {logo && <div className="mx-auto mb-4">{logo}</div>}
            <CardTitle className="text-2xl">
              {t(($) => $.reset_password.set_new_password)}
            </CardTitle>
            <CardDescription>
              {t(($) => $.reset_password.enter_new_password)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form id="reset-password-form" onSubmit={handleSubmitPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">{t(($) => $.common.password)}</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder={t(($) => $.common.password_placeholder)}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-new-password">{t(($) => $.reset_password.confirm_password)}</Label>
                <Input
                  id="confirm-new-password"
                  type="password"
                  placeholder={t(($) => $.set_password.confirm_password_placeholder)}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              type="submit"
              form="reset-password-form"
              className="w-full"
              size="lg"
              disabled={!password || !confirmPassword || loading}
            >
              {loading ? t(($) => $.reset_password.resetting) : t(($) => $.reset_password.reset)}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep("code");
                setError("");
              }}
            >
              {t(($) => $.common.back)}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // --- Code verification step ---
  if (step === "code") {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            {logo && <div className="mx-auto mb-4">{logo}</div>}
            <CardTitle className="text-2xl">
              {t(($) => $.verify.title)}
            </CardTitle>
            <CardDescription>
              {t(($) => $.verify.description, { email })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(value) => {
                setCode(value);
                if (value.length === 6) handleVerifyCode(value);
              }}
              disabled={loading}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0}
                className="text-primary underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
              >
                {cooldown > 0
                  ? t(($) => $.verify.resend_cooldown, { seconds: cooldown })
                  : t(($) => $.verify.resend)}
              </button>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
              }}
            >
              {t(($) => $.common.back)}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // --- Email step ---
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          {logo && <div className="mx-auto mb-4">{logo}</div>}
          <CardTitle className="text-2xl">
            {t(($) => $.reset_password.title)}
          </CardTitle>
          <CardDescription>
            {t(($) => $.reset_password.description)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="reset-form" onSubmit={(e) => { e.preventDefault(); handleSendCode(); }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">{t(($) => $.common.email)}</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder={t(($) => $.common.email_placeholder)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            form="reset-form"
            className="w-full"
            size="lg"
            disabled={!email || loading}
          >
            {loading ? t(($) => $.signin.sending) : t(($) => $.reset_password.send_code)}
          </Button>
          {onBack && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={onBack}
            >
              {t(($) => $.common.back)}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
