"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@iteamify/ui/components/ui/card";
import { Input } from "@iteamify/ui/components/ui/input";
import { Button } from "@iteamify/ui/components/ui/button";
import { Label } from "@iteamify/ui/components/ui/label";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@iteamify/ui/components/ui/input-otp";
import { useAuthStore, type AuthChallenge, type AuthProof, type AuthPurpose } from "@iteamify/core/auth";
import { workspaceKeys } from "@iteamify/core/workspace/queries";
import { api } from "@iteamify/core/api";
import type { User } from "@iteamify/core/types";
import { cn } from "@iteamify/ui/lib/utils";
import { useT } from "../i18n";
import { PasswordField } from "./password-field";
import { retryAfterSeconds, useAuthErrorMessage } from "./auth-error";

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

type LoginMode = "password" | "code" | "signup" | "reset";

interface LoginPageProps {
  passwordEnabled?: boolean;
  allowSignup?: boolean;
  initialMode?: LoginMode;
  /** Email resolved from an invitation before the form is mounted. */
  initialEmail?: string;
  /** Logo element rendered above the title */
  logo?: ReactNode;
  /** Called after successful login. The workspace list is seeded into React
   *  Query before this fires, so the caller can compute a destination URL. */
  onSuccess: () => void | Promise<void>;
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
  /** Additional layout styling for platform-specific shells. */
  containerClassName?: string;
  /** Additional card styling for platform-specific shells. */
  cardClassName?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function redirectToCliCallback(url: string, token: string, state: string) {
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

export function LoginPage({
  logo,
  onSuccess,
  google,
  cliCallback,
  onTokenObtained,
  onGoogleLogin,
  extra,
  containerClassName,
  cardClassName,
  passwordEnabled = true,
  allowSignup = true,
  initialMode,
  initialEmail = "",
}: LoginPageProps) {
  const { t, i18n } = useT("auth");
  const qc = useQueryClient();
  const [step, setStep] = useState<"email" | "code" | "cli_confirm" | "password_setup" | "resources" | "reset_done">("email");
  const [mode, setMode] = useState<LoginMode>(initialMode ?? (passwordEnabled ? "password" : "code"));
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null);
  const [proof, setProof] = useState<AuthProof | null>(null);
  const [resourceError, setResourceError] = useState(false);
  const busy = useRef(false);
  const cooldownUntil = useRef(0);
  const previousCapability = useRef(passwordEnabled);
  const authError = useAuthErrorMessage();
  const language = i18n.resolvedLanguage === "zh-Hans" ? "zh-Hans" : "en";
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [existingUser, setExistingUser] = useState<User | null>(null);
  // Tracks how the existing session was detected so handleCliAuthorize
  // uses the matching token source (cookie → issueCliToken, localStorage → direct).
  const authSourceRef = useRef<"cookie" | "localStorage">("cookie");
  const shellClassName = cn(
    "flex min-h-svh items-center justify-center",
    containerClassName,
  );
  const surfaceClassName = cn("w-full max-w-sm", cardClassName);

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
        const token = localStorage.getItem("iteamify_token");
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
            localStorage.removeItem("iteamify_token");
          });
      });
  }, [cliCallback]);

  useEffect(() => {
    if (passwordEnabled !== previousCapability.current) {
      previousCapability.current = passwordEnabled;
      if (step === "email" && !email && !initialMode) setMode(passwordEnabled ? "password" : "code");
    }
  }, [passwordEnabled, step, email, initialMode]);

  const startCooldown = (seconds: number) => {
    cooldownUntil.current = Date.now() + seconds * 1000;
    setCooldown(seconds);
  };
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(Math.max(0, Math.ceil((cooldownUntil.current - Date.now()) / 1000))), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const switchMode = (next: LoginMode) => {
    if (busy.current) return;
    setMode(next);
    setStep("email");
    setError("");
    setCode("");
    setPassword("");
    setProof(null);
    setChallenge(null);
  };

  const loadDestination = async () => {
    setStep("resources");
    setResourceError(false);
    setLoading(true);
    try {
      const wsList = await api.listWorkspaces();
      qc.setQueryData(workspaceKeys.list(), wsList);
      await onSuccess();
    } catch {
      setResourceError(true);
    } finally {
      setLoading(false);
    }
  };

  const authenticated = async (token?: string) => {
    setPassword("");
    setCode("");
    setProof(null);
    onTokenObtained?.();
    if (cliCallback) {
      const bearer = token ?? (await api.issueCliToken()).token;
      localStorage.setItem("iteamify_token", bearer);
      api.setToken(bearer);
      redirectToCliCallback(cliCallback.url, bearer, cliCallback.state);
      return;
    }
    await loadDestination();
  };

  const sendCode = async () => {
    if (passwordEnabled) {
      const result = await api.createAuthChallenge(email, mode === "password" ? "login" : mode === "code" ? "login" : mode, language);
      setChallenge(result);
      startCooldown(result.retry_after_seconds);
    } else {
      await useAuthStore.getState().sendCode(email, language);
      startCooldown(60);
    }
    setStep("code");
    setCode("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current || !email) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      if (mode === "password" && passwordEnabled) {
        await useAuthStore.getState().loginWithPassword(email, password);
        await authenticated();
      } else {
        await sendCode();
      }
    } catch (error) {
      setError(authError(error));
      const retry = retryAfterSeconds(error);
      if (retry !== undefined) startCooldown(retry);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  const handleVerify = async (value: string) => {
    if (value.length !== 6 || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      if (passwordEnabled && challenge) {
        const purpose: AuthPurpose = mode === "code" ? "login" : mode === "password" ? "login" : mode;
        const result = await useAuthStore.getState().verifyAuthChallenge({ email, purpose, challenge_id: challenge.challenge_id, code: value });
        if (result.action === "authenticated") {
          await authenticated(result.token);
        } else {
          setProof({ email, purpose: result.action, challenge_id: challenge.challenge_id, proof: result.proof });
          setMode(result.action === "reset" ? "reset" : "signup");
          setCode("");
          setStep("password_setup");
        }
      } else if (cliCallback) {
        const { token } = await api.verifyCode(email, value);
        await authenticated(token);
      } else {
        await useAuthStore.getState().verifyCode(email, value);
        await authenticated();
      }
    } catch (error) {
      setError(authError(error));
      setCode("");
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try { await sendCode(); }
    catch (error) {
      setError(authError(error));
      const retry = retryAfterSeconds(error);
      if (retry !== undefined) startCooldown(retry);
    } finally { busy.current = false; setLoading(false); }
  };

  const handleSavePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!proof || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      if (proof.purpose === "reset") {
        await api.resetPassword({ ...proof, password, language });
        setPassword("");
        setProof(null);
        setStep("reset_done");
      } else {
        await useAuthStore.getState().signupWithPassword({ ...proof, password });
        await authenticated();
      }
    } catch (error) { setError(authError(error)); }
    finally { busy.current = false; setLoading(false); }
  };

  const handleCliAuthorize = async () => {
    if (!cliCallback || busy.current) return;
    busy.current = true;
    setLoading(true);

    try {
      let token: string;

      if (authSourceRef.current === "localStorage") {
        // Session was detected via localStorage — reuse that token directly.
        const stored = localStorage.getItem("iteamify_token");
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
    } finally {
      busy.current = false;
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

  if (step === "resources" || step === "reset_done") {
    return (
      <div className={shellClassName}>
        <Card className={surfaceClassName}>
          <CardHeader className="text-center">
            {logo && <div className="mx-auto mb-4">{logo}</div>}
            <CardTitle>{step === "reset_done" ? t(($) => $.password.reset_done) : resourceError ? t(($) => $.password.load_failed) : t(($) => $.password.loading)}</CardTitle>
            {step === "reset_done" && <CardDescription>{t(($) => $.password.reset_done_description)}</CardDescription>}
          </CardHeader>
          <CardFooter>
            {step === "reset_done" ? <Button className="w-full" onClick={() => switchMode("password")}>{t(($) => $.password.back_login)}</Button>
              : resourceError ? <Button className="w-full" disabled={loading} onClick={loadDestination}>{t(($) => $.password.retry)}</Button> : null}
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (step === "password_setup") {
    return (
      <div className={shellClassName}>
        <Card className={surfaceClassName}>
          <CardHeader className="text-center">
            {logo && <div className="mx-auto mb-4">{logo}</div>}
            <CardTitle>{t(($) => $.password.set_title)}</CardTitle>
            <CardDescription>{t(($) => $.password.set_description, { email })}</CardDescription>
          </CardHeader>
          <CardContent>
            <form id="set-password-form" onSubmit={handleSavePassword} className="space-y-3">
              <input type="hidden" name="username" autoComplete="username" value={email} />
              <Label htmlFor="new-password">{t(($) => $.password.new_label)}</Label>
              <PasswordField id="new-password" name="new-password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus disabled={loading} required aria-describedby="password-policy" />
              <p id="password-policy" className="text-xs leading-5 text-muted-foreground">{t(($) => $.password.policy)}</p>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button className="w-full" type="submit" form="set-password-form" disabled={loading || Array.from(password).length < 10 || Array.from(password).length > 128}>{loading ? t(($) => $.password.saving) : mode === "reset" ? t(($) => $.password.save) : t(($) => $.password.create)}</Button>
            <Button variant="ghost" className="w-full" disabled={loading} onClick={() => switchMode("password")}>{t(($) => $.password.back_login)}</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // CLI confirm step
  // -------------------------------------------------------------------------

  if (step === "cli_confirm" && existingUser) {
    return (
      <div className={shellClassName}>
        <Card className={surfaceClassName}>
          <CardHeader className="text-center">
            {logo && <div className="mx-auto mb-4">{logo}</div>}
            <CardTitle className="text-2xl">
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
              disabled={loading}
              onClick={() => {
                setExistingUser(null);
                setStep("email");
              }}
            >
              {t(($) => $.cli.different_account)}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Code verification step
  // -------------------------------------------------------------------------

  if (step === "code") {
    return (
      <div className={shellClassName}>
        <Card className={surfaceClassName}>
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
              autoFocus
              autoComplete="one-time-code"
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
              <p role="alert" className="text-sm text-destructive">{error}</p>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || loading}
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
              disabled={loading}
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

  // -------------------------------------------------------------------------
  // Email step
  // -------------------------------------------------------------------------

  return (
    <div className={shellClassName}>
      <Card className={surfaceClassName}>
        <CardHeader className="text-center">
          {logo && <div className="mx-auto mb-4">{logo}</div>}
          <CardTitle className="text-2xl">
            {mode === "signup" ? t(($) => $.password.signup_title) : mode === "reset" ? t(($) => $.password.reset_title) : t(($) => $.signin.title)}
          </CardTitle>
          <CardDescription>
            {mode === "signup" ? t(($) => $.password.signup_description) : mode === "reset" ? t(($) => $.password.reset_description) : mode === "password" ? t(($) => $.password.signin_description) : t(($) => $.signin.description)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {passwordEnabled && (mode === "password" || mode === "code") && (
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="group" aria-label={t(($) => $.signin.title)}>
              <Button variant={mode === "password" ? "secondary" : "ghost"} size="sm" disabled={loading} aria-pressed={mode === "password"} onClick={() => switchMode("password")}>{t(($) => $.password.password_login)}</Button>
              <Button variant={mode === "code" ? "secondary" : "ghost"} size="sm" disabled={loading} aria-pressed={mode === "code"} onClick={() => switchMode("code")}>{t(($) => $.password.code_login)}</Button>
            </div>
          )}
          <form id="login-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">{t(($) => $.common.email)}</Label>
              <Input
                id="login-email"
                type="email"
                placeholder={t(($) => $.common.email_placeholder)}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                autoComplete="username"
                name="email"
                disabled={loading}
                required
              />
            </div>
            {mode === "password" && passwordEnabled && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="login-password">{t(($) => $.password.label)}</Label>
                  <button type="button" disabled={loading} onClick={() => switchMode("reset")} className="text-xs text-muted-foreground underline-offset-4 hover:underline">{t(($) => $.password.forgot)}</button>
                </div>
                <PasswordField id="login-password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={loading} required />
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            type="submit"
            form="login-form"
            className="w-full"
            size="lg"
            disabled={!email || loading || (mode === "password" && !password)}
          >
            {mode === "password"
              ? loading ? t(($) => $.password.signing_in) : t(($) => $.password.signin)
              : loading ? t(($) => $.signin.sending) : t(($) => $.signin.continue)}
          </Button>
          {(google || onGoogleLogin) && mode !== "reset" && (
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
          )}
          {passwordEnabled && (allowSignup || mode === "signup" || mode === "reset") && (
            <Button type="button" variant="ghost" className="w-full" disabled={loading} onClick={() => switchMode(mode === "signup" || mode === "reset" ? "password" : "signup")}>
              {mode === "signup" || mode === "reset" ? t(($) => $.password.back_login) : t(($) => $.password.signup)}
            </Button>
          )}
          {extra && <div className="w-full pt-1 text-center">{extra}</div>}
        </CardFooter>
      </Card>
    </div>
  );
}
