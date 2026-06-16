"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { useAuthStore } from "@teamify/core/auth";
import { workspaceKeys } from "@teamify/core/workspace/queries";
import { api } from "@teamify/core/api";
import type { User } from "@teamify/core/types";
import { useT } from "../i18n";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GoogleAuthConfig {
  clientId: string;
  redirectUri: string;
  /** Opaque state passed through Google OAuth (e.g. "platform:desktop"). */
  state?: string;
}

interface CliCallbackConfig {
  /** Validated localhost callback URL */
  url: string;
  /** Opaque state to pass back to CLI */
  state: string;
}

interface LoginPageProps {
  /** Logo element rendered above the title */
  logo?: ReactNode;
  /** Called after successful login. The workspace list is seeded into React
   *  Query before this fires, so the caller can compute a destination URL. */
  onSuccess: () => void;
  /** Google OAuth config. Omit to disable Google login. */
  google?: GoogleAuthConfig;
  /** CLI callback config for authorizing CLI tools. */
  cliCallback?: CliCallbackConfig;
  /** Called after a token is obtained (e.g. to set cookies). */
  onTokenObtained?: () => void;
  /** Override Google login handler (e.g. desktop opens browser externally). When provided, renders the Google button even if `google` config is omitted. */
  onGoogleLogin?: () => void;
  /** Slot rendered at the bottom of the sign-in card, below the
   *  Google button. The web shell uses it for a "Prefer the desktop
   *  app?" prompt; desktop omits it (a download prompt inside the app
   *  would be absurd). */
  extra?: ReactNode;
  /** Initial login mode. Defaults to "code". */
  defaultMode?: "code" | "password";
  /** When false, omits the outer min-h-svh centered wrapper. Defaults to true. */
  fullPage?: boolean;
  /** Called when user clicks "Forgot password?". Omit to hide the link. */
  onForgotPassword?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function redirectToCliCallback(url: string, token: string, state: string) {
  const separator = url.includes("?") ? "&" : "?";
  window.location.href = `${url}${separator}token=${encodeURIComponent(token)}&state=${encodeURIComponent(state)}`;
}

/**
 * Validate that a CLI callback URL points to a safe host over HTTP.
 * Allows localhost and private/LAN IPs (RFC 1918) to support self-hosted setups
 * on local VMs while blocking arbitrary public hosts.
 */
export function validateCliCallback(cliCallback: string): boolean {
  try {
    const cbUrl = new URL(cliCallback);
    if (cbUrl.protocol !== "http:") return false;
    const h = cbUrl.hostname;
    if (h === "localhost" || h === "127.0.0.1") return true;
    // Allow RFC 1918 private IPs: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
    if (/^10\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    if (/^192\.168\./.test(h)) return true;
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DEFAULT_CODE_CHANNEL: "email" | "sms" = "sms";

export function LoginPage({
  logo,
  onSuccess,
  google,
  cliCallback,
  onTokenObtained,
  onGoogleLogin,
  extra,
  defaultMode,
  fullPage = true,
  onForgotPassword,
}: LoginPageProps) {
  const { t } = useT("auth");
  const qc = useQueryClient();
  const [step, setStep] = useState<"email" | "code" | "cli_confirm">("email");
  const [loginMode, setLoginMode] = useState<"code" | "password">(defaultMode ?? "code");
  const [codeChannel, setCodeChannel] = useState<"email" | "sms">(DEFAULT_CODE_CHANNEL);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [existingUser, setExistingUser] = useState<User | null>(null);
  // Tracks how the existing session was detected so handleCliAuthorize
  // uses the matching token source (cookie → issueCliToken, localStorage → direct).
  const authSourceRef = useRef<"cookie" | "localStorage">("cookie");
  const codeContact = codeChannel === "sms"
    ? { phone: phone.trim(), channel: "sms" as const }
    : { email: email.trim(), channel: "email" as const };
  const codeContactValue = codeChannel === "sms" ? phone.trim() : email.trim();

  // Check for existing session when CLI callback is present.
  // Prioritises cookie auth (= current browser session) to avoid authorising
  // the CLI with a stale or mismatched localStorage token.
  useEffect(() => {
    if (!cliCallback) return;

    // Ensure no stale bearer token interferes — we want to test the cookie first.
    api.setToken(null);

    api
      .getMe()
      .then((user) => {
        authSourceRef.current = "cookie";
        setExistingUser(user);
        setStep("cli_confirm");
      })
      .catch(() => {
        // Cookie auth failed — fall back to localStorage token
        const token = localStorage.getItem("teamify_token");
        if (!token) return;

        api.setToken(token);
        api
          .getMe()
          .then((user) => {
            authSourceRef.current = "localStorage";
            setExistingUser(user);
            setStep("cli_confirm");
          })
          .catch(() => {
            api.setToken(null);
            localStorage.removeItem("teamify_token");
          });
      });
  }, [cliCallback]);

  // Cooldown timer for resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSendCode = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (loginMode === "code" && !codeContactValue) {
        setError(codeChannel === "sms" ? t(($) => $.common.phone_required) : t(($) => $.common.email_required));
        return;
      }
      if (loginMode === "password" && !email) {
        setError(t(($) => $.common.email_required));
        return;
      }

      // If user selected password mode, do password login instead
      if (loginMode === "password") {
        setLoading(true);
        setError("");
        try {
          if (cliCallback) {
            const { token } = await api.verifyPassword(email, password);
            localStorage.setItem("teamify_token", token);
            api.setToken(token);
            onTokenObtained?.();
            redirectToCliCallback(cliCallback.url, token, cliCallback.state);
            return;
          }
          await useAuthStore.getState().verifyPassword(email, password);
          const wsList = await api.listWorkspaces();
          qc.setQueryData(workspaceKeys.list(), wsList);
          onTokenObtained?.();
          onSuccess();
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : `${t(($) => $.errors.password_invalid)}`,
          );
        } finally {
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError("");
      try {
        await useAuthStore.getState().sendCode(codeContact);
        setStep("code");
        setCode("");
        setCooldown(60);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : `${t(($) => $.errors.send_failed)} ${t(($) => $.errors.server_unreachable)}`,
        );
      } finally {
        setLoading(false);
      }
    },
    [email, password, loginMode, codeContact, codeContactValue, codeChannel, t, cliCallback, onSuccess, onTokenObtained, qc],
  );

  const handleVerify = useCallback(
    async (value: string) => {
      if (value.length !== 6) return;
      setLoading(true);
      setError("");
      try {
        if (cliCallback) {
          // CLI path: get token directly for the redirect URL
          const { token } = await api.verifyCode(codeContact, value);
          localStorage.setItem("teamify_token", token);
          api.setToken(token);
          onTokenObtained?.();
          redirectToCliCallback(cliCallback.url, token, cliCallback.state);
          return;
        }

        // Normal path: seed the workspace list into the Query cache so the
        // caller's onSuccess can read it synchronously to compute a destination
        // URL (first workspace's slug, or /workspaces/new for zero-workspace
        // users).
        await useAuthStore.getState().verifyCode(codeContact, value);
        const wsList = await api.listWorkspaces();
        qc.setQueryData(workspaceKeys.list(), wsList);
        onTokenObtained?.();
        onSuccess();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t(($) => $.errors.code_invalid),
        );
        setCode("");
        setLoading(false);
      }
    },
    [codeContact, onSuccess, cliCallback, onTokenObtained, qc, t],
  );

  const handleResend = async () => {
    if (cooldown > 0) return;
    setError("");
    try {
      await useAuthStore.getState().sendCode(codeContact);
      setCooldown(60);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t(($) => $.errors.resend_failed),
      );
    }
  };

  const handleCliAuthorize = async () => {
    if (!cliCallback) return;
    setLoading(true);

    try {
      let token: string;

      if (authSourceRef.current === "localStorage") {
        // Session was detected via localStorage — reuse that token directly.
        const stored = localStorage.getItem("teamify_token");
        if (!stored) throw new Error("token missing");
        token = stored;
      } else {
        // Session was detected via cookie — obtain a bearer token from the server.
        const res = await api.issueCliToken();
        token = res.token;
      }

      onTokenObtained?.();
      redirectToCliCallback(cliCallback.url, token, cliCallback.state);
    } catch {
      setError(t(($) => $.errors.cli_auth_failed));
      setExistingUser(null);
      setStep("email");
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    if (onGoogleLogin) {
      onGoogleLogin();
      return;
    }
    if (!google) return;
    const params = new URLSearchParams({
      client_id: google.clientId,
      redirect_uri: google.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "select_account",
    });
    if (google.state) params.set("state", google.state);
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  };

  const wrapContent = (content: ReactNode) =>
    fullPage ? <div className="flex min-h-svh items-center justify-center">{content}</div> : content;

  // -------------------------------------------------------------------------
  // CLI confirm step
  // -------------------------------------------------------------------------

  if (step === "cli_confirm" && existingUser) {
    return wrapContent(
        <Card className="w-full max-w-sm shadow-sm ring-1 ring-foreground/5">
          <CardHeader className="text-center">
            {logo && <div className="mx-auto mb-4">{logo}</div>}
            <CardTitle className="text-2xl font-semibold">
              {t(($) => $.cli.title)}
            </CardTitle>
            <CardDescription>
              {t(($) => $.cli.description, { email: existingUser.email })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              onClick={handleCliAuthorize}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading
                ? t(($) => $.cli.authorizing)
                : t(($) => $.cli.authorize)}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setExistingUser(null);
                setStep("email");
              }}
            >
              {t(($) => $.cli.different_account)}
            </Button>
          </CardContent>
        </Card>
    );
  }

  // -------------------------------------------------------------------------
  // Code verification step
  // -------------------------------------------------------------------------

  if (step === "code") {
    return wrapContent(
        <Card className="w-full max-w-sm shadow-sm ring-1 ring-foreground/5">
          <CardHeader className="text-center">
            {logo && <div className="mx-auto mb-4">{logo}</div>}
            <CardTitle className="text-2xl font-semibold">
              {t(($) => $.verify.title)}
            </CardTitle>
            <CardDescription>
              {codeChannel === "sms"
                ? t(($) => $.verify.description_sms, { phone })
                : t(($) => $.verify.description, { email })}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(value) => {
                setCode(value);
                if (value.length === 6) handleVerify(value);
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
    );
  }

  // -------------------------------------------------------------------------
  // Email step
  // -------------------------------------------------------------------------

  return wrapContent(
      <Card className="w-full max-w-sm shadow-sm ring-1 ring-foreground/5">
        <CardHeader className="text-center">
          {logo && <div className="mx-auto mb-4">{logo}</div>}
          <CardTitle className="text-2xl font-semibold">
            {t(($) => $.signin.title)}
          </CardTitle>
          <CardDescription>
            {loginMode === "password"
              ? t(($) => $.signin.description_password)
              : codeChannel === "sms"
                ? t(($) => $.signin.description_sms)
                : t(($) => $.signin.description)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="login-form" onSubmit={handleSendCode} className="space-y-4">
            {loginMode === "code" && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={codeChannel === "email" ? "default" : "outline"}
                  onClick={() => {
                    setCodeChannel("email");
                    setError("");
                  }}
                >
                  {t(($) => $.signin.email_code)}
                </Button>
                <Button
                  type="button"
                  variant={codeChannel === "sms" ? "default" : "outline"}
                  onClick={() => {
                    setCodeChannel("sms");
                    setError("");
                  }}
                >
                  {t(($) => $.signin.sms_code)}
                </Button>
              </div>
            )}

            {(loginMode === "password" || codeChannel === "email") && (
              <div className="space-y-2">
                <Label htmlFor="login-email">{t(($) => $.common.email)}</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder={t(($) => $.common.email_placeholder)}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            )}

            {loginMode === "code" && codeChannel === "sms" && (
              <div className="space-y-2">
                <Label htmlFor="login-phone">{t(($) => $.common.phone)}</Label>
                <Input
                  id="login-phone"
                  type="tel"
                  placeholder={t(($) => $.common.phone_placeholder)}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            )}

            {loginMode === "password" && (
              <div className="space-y-2">
                <Label htmlFor="login-password">{t(($) => $.common.password)}</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder={t(($) => $.common.password_placeholder)}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                  minLength={8}
                />
              </div>
            )}

            {loginMode === "password" && onForgotPassword && (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-sm text-primary underline-offset-4 hover:underline"
                  onClick={onForgotPassword}
                >
                  {t(($) => $.signin.forgot_password)}
                </button>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              form="login-form"
              className="w-full"
              size="lg"
              disabled={
                loading ||
                (loginMode === "password" && (!email || !password)) ||
                (loginMode === "code" && !codeContactValue)
              }
            >
              {loading
                ? (loginMode === "password"
                    ? t(($) => $.signin.logging_in)
                    : t(($) => $.signin.sending))
                : (loginMode === "password"
                    ? t(($) => $.signin.login)
                    : t(($) => $.signin.continue))}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 bg-transparent">
          {/* Login mode toggle */}
          <div className="flex w-full items-center justify-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {loginMode === "code" ? t(($) => $.signin.password_login_prompt) : t(($) => $.signin.code_login_prompt)}
            </span>
            <button
              type="button"
              className="text-primary underline-offset-4 hover:underline"
              onClick={() => {
                setLoginMode(loginMode === "code" ? "password" : "code");
                setCodeChannel(DEFAULT_CODE_CHANNEL);
                setError("");
                setPassword("");
                setCode("");
              }}
            >
              {loginMode === "code" ? t(($) => $.signin.use_password) : t(($) => $.signin.use_code)}
            </button>
          </div>

          {(google || onGoogleLogin) && (
            <>
              <div className="relative w-full">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    {t(($) => $.signin.divider)}
                  </span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                size="lg"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {t(($) => $.signin.google)}
              </Button>
            </>
          )}
          {extra && <div className="w-full pt-1 text-center">{extra}</div>}
        </CardFooter>
      </Card>
  );
}
