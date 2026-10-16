"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { sanitizeNextUrl, useAuthStore } from "@iteamify/core/auth";
import { useConfigStore } from "@iteamify/core/config";
import {
  workspaceKeys,
  workspaceListOptions,
} from "@iteamify/core/workspace/queries";
import {
  paths,
  resolvePostAuthDestination,
  useHasOnboarded,
} from "@iteamify/core/paths";
import { api } from "@iteamify/core/api";
import type { Workspace } from "@iteamify/core/types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@iteamify/ui/components/ui/card";
import { Button } from "@iteamify/ui/components/ui/button";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import { setLoggedInCookie } from "@/features/auth/auth-cookie";
import { LoginPage, validateCliCallback } from "@iteamify/views/auth";
import { useT } from "@iteamify/views/i18n";
import { LocaleProvider } from "@/features/landing/i18n";
import { LandingHeader } from "@/features/landing/components/landing-header";
import { LandingFooter } from "@/features/landing/components/landing-footer";
import { BrandMark } from "@/features/landing/components/brand-mark";

// `Card` drops its own bottom padding whenever a card-footer is present
// (`has-data-[slot=card-footer]:pb-0`) because the footer is normally a
// full-bleed bar that supplies the inset itself. This shell strips the footer
// back to a transparent, borderless slot, so the inset has to be handed back
// to the footer — otherwise the trailing row (the "prefer the desktop app?"
// prompt) sits flush against the rounded bottom edge.
const BRAND_AUTH_CARD_CLASS_NAME =
  "max-w-none gap-5 rounded-[28px] border-[#141724]/10 bg-white/92 py-7 shadow-[0_32px_90px_rgba(20,23,36,0.14)] backdrop-blur-xl [&_[data-slot=card-header]]:px-6 [&_[data-slot=card-content]]:px-6 [&_[data-slot=card-footer]]:border-0 [&_[data-slot=card-footer]]:bg-transparent [&_[data-slot=card-footer]]:px-6 [&_[data-slot=card-footer]]:pb-7 [&_[data-slot=input]]:h-11 [&_[data-slot=button]]:h-11 sm:[&_[data-slot=card-header]]:px-8 sm:[&_[data-slot=card-content]]:px-8 sm:[&_[data-slot=card-footer]]:px-8";

function BrandLoginShell({ children }: { children: ReactNode }) {
  const { t, i18n } = useT("auth");
  const initialLocale =
    i18n.resolvedLanguage === "zh-Hans" ? "zh-Hans" : "en";
  const loopSteps = [
    t(($) => $.web.brand.step_context),
    t(($) => $.web.brand.step_action),
    t(($) => $.web.brand.step_approval),
  ];

  return (
    <LocaleProvider initialLocale={initialLocale}>
      <div className="iteamify-auth-light landing-brand h-full overflow-x-hidden overflow-y-auto bg-white text-[#141724]">
        <LandingHeader
          variant="brand"
          transparentAtTop={false}
          showCta={false}
        />

        <main className="relative isolate overflow-hidden px-4 pb-16 pt-28 sm:px-6 sm:pb-20 sm:pt-32 lg:min-h-[820px] lg:px-8 lg:pb-24 lg:pt-28">
          {/* Same scheme as the marketing hero: white canvas, soft washes at the
              edges instead of a tinted fold. The coral second wash is gone —
              the reference keeps one hue, and the form card carries the accent. */}
          <div
            className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(48%_54%_at_0%_10%,rgba(81,102,216,0.15),transparent_72%),radial-gradient(42%_48%_at_100%_2%,rgba(81,102,216,0.1),transparent_74%)]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 -z-20 h-1/2 bg-[linear-gradient(to_bottom,transparent,rgba(255,255,255,0.65))]"
            aria-hidden
          />
          <BrandMark
            className="pointer-events-none absolute -left-24 bottom-2 -z-10 hidden size-[430px] rotate-[-9deg] opacity-[0.035] lg:block"
            tone="mono"
          />

          <div className="mx-auto grid w-full max-w-[1180px] items-center gap-14 lg:grid-cols-[1.08fr_0.82fr] lg:gap-20">
            <section className="hidden max-w-[620px] lg:block" aria-labelledby="login-brand-title">
              <div className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#5166d8]">
                <span className="size-1.5 rounded-full bg-[#f06d5c]" aria-hidden />
                {t(($) => $.web.brand.eyebrow)}
              </div>
              {/* One heavy grotesque headline that wraps naturally into two
                  lines, both in the same ink — the reference poster's
                  treatment, so the emphasis line is no longer a serif italic
                  in a second colour. */}
              <h1
                id="login-brand-title"
                className="mt-7 max-w-[610px] text-balance text-[clamp(34px,3.6vw,52px)] font-bold leading-[1.14] tracking-[-0.035em] text-[#141724]"
              >
                {t(($) => $.web.brand.title_lead)}{" "}
                {t(($) => $.web.brand.title_emphasis)}
              </h1>
              <p className="mt-7 max-w-[560px] text-[16px] leading-[1.7] text-[#596172]">
                {t(($) => $.web.brand.description)}
              </p>

              <div className="mt-10 max-w-[560px] rounded-[24px] border border-[#141724]/8 bg-white/58 p-5 shadow-[0_20px_60px_rgba(20,23,36,0.06)] backdrop-blur-md">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <BrandMark className="size-7" />
                    <span className="text-[14px] font-semibold tracking-[-0.01em]">
                      {t(($) => $.web.brand.loop_label)}
                    </span>
                  </div>
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-[#596172]">
                    <span className="size-1.5 rounded-full bg-[#55a88a]" aria-hidden />
                    {t(($) => $.web.brand.loop_status)}
                  </span>
                </div>
                <div className="relative mt-6 grid grid-cols-3 gap-3">
                  <div className="absolute left-[16.5%] right-[16.5%] top-[17px] h-px bg-[#141724]/12" aria-hidden />
                  {loopSteps.map((step, index) => (
                    <div key={step} className="relative flex flex-col items-center text-center">
                      <span
                        className={`relative z-10 flex size-9 items-center justify-center rounded-full border text-[11px] font-semibold ${
                          index === loopSteps.length - 1
                            ? "border-[#f06d5c]/35 bg-[#fff4f0] text-[#d85444]"
                            : "border-[#5166d8]/18 bg-[#eef0ff] text-[#5166d8]"
                        }`}
                      >
                        {index < loopSteps.length - 1 ? (
                          <Check className="size-3.5" aria-hidden />
                        ) : (
                          "03"
                        )}
                      </span>
                      <span className="mt-3 text-[12px] font-medium text-[#596172]">
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="mt-5 flex items-center gap-2 text-[12px] text-[#687082]">
                <ShieldCheck className="size-4 text-[#55a88a]" aria-hidden />
                {t(($) => $.web.brand.trust)}
              </p>
            </section>

            <section className="relative z-10 mx-auto w-full max-w-[470px] lg:mx-0 lg:justify-self-end" aria-label={t(($) => $.web.brand.access_label)}>
              <div className="mb-6 text-center lg:hidden">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#5166d8]">
                  {t(($) => $.web.brand.eyebrow)}
                </p>
                <h1 className="mt-3 text-[32px] font-bold leading-[1.14] tracking-[-0.035em] text-[#141724]">
                  {t(($) => $.web.brand.mobile_title)}
                </h1>
                <p className="mx-auto mt-2 max-w-[330px] text-[14px] leading-6 text-[#687082]">
                  {t(($) => $.web.brand.mobile_description)}
                </p>
              </div>
              <div className="mb-3 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#141724]/42">
                <span>{t(($) => $.web.brand.access_label)}</span>
                <span aria-hidden>01 / iteamify</span>
              </div>
              {children}
            </section>
          </div>
        </main>

        <LandingFooter showCta={false} />
      </div>
    </LocaleProvider>
  );
}

function BrandCardLogo() {
  return (
    <div className="flex size-14 items-center justify-center rounded-[18px] border border-[#141724]/8 bg-[#f7f5f2] shadow-[0_10px_28px_rgba(20,23,36,0.08)]">
      <BrandMark className="size-8" />
    </div>
  );
}

/**
 * Pick where a logged-in user with no explicit `?next=` should land.
 * Un-onboarded users with pending invitations on their email get routed to
 * the batch /invitations page; everyone else falls through to the standard
 * resolver. A network blip on listMyInvitations is non-fatal — we fall
 * through rather than trap the user on an error screen.
 */
async function resolveLoggedInDestination(
  qc: QueryClient,
  hasOnboarded: boolean,
  workspaces: Workspace[],
): Promise<string> {
  if (!hasOnboarded) {
    try {
      const invites = await api.listMyInvitations();
      if (invites.length > 0) {
        qc.setQueryData(workspaceKeys.myInvitations(), invites);
        return paths.invitations();
      }
    } catch {
      // fall through
    }
  }
  return resolvePostAuthDestination(workspaces, hasOnboarded);
}

function LoginPageContent() {
  const router = useRouter();
  const qc = useQueryClient();
  const { t } = useT("auth");
  const googleClientId = useConfigStore((state) => state.googleClientId);
  const passwordEnabled = useConfigStore((state) => state.passwordAuthEnabled);
  const allowSignup = useConfigStore((state) => state.allowSignup);
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);
  const searchParams = useSearchParams();

  const cliCallbackRaw = searchParams.get("cli_callback");
  const cliState = searchParams.get("cli_state") || "";
  const platform = searchParams.get("platform");
  const isDesktopHandoff = platform === "desktop" && !cliCallbackRaw;
  // `next` carries a protected URL the user was originally headed to
  // (e.g. /invite/{id}). With URL-driven workspaces there is no legacy
  // "/issues" default — if `next` is absent we decide after login based on
  // the user's workspace list. Sanitize first so a crafted `?next=https://evil`
  // cannot bounce the user off-origin after a successful login.
  const nextUrl = sanitizeNextUrl(searchParams.get("next"));
  const invitationId = nextUrl?.match(/^\/invite\/([^/?#]+)\/?$/)?.[1];
  const invitationLogin = useQuery({
    queryKey: ["invitation-login", invitationId],
    queryFn: () => api.getInvitationLoginContext(invitationId!),
    enabled: !!invitationId && !isLoading && !user,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  const [desktopToken, setDesktopToken] = useState<string | null>(null);
  const [desktopError, setDesktopError] = useState("");
  const hasOnboarded = useHasOnboarded();

  // Latched once auth has been observed settled as logged-out on this page.
  // Any `user` that appears afterwards came from the login form in this
  // session — not from an existing session found on arrival.
  const settledLoggedOutRef = useRef(false);

  // Already authenticated ON ARRIVAL — honor ?next= or fall back to first
  // workspace (or /onboarding if the user has none). Skip this entire path
  // when the user arrived to authorize the CLI.
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      settledLoggedOutRef.current = true;
      return;
    }
    if (cliCallbackRaw) return;
    if (isDesktopHandoff) {
      // Desktop opened the browser for login but the web session is already
      // authenticated — mint a bearer token from the cookie session and hand
      // it off via deep link instead of silently redirecting to the workspace.
      api
        .issueCliToken()
        .then(({ token }) => {
          setDesktopToken(token);
          window.location.href = `iteamify://auth/callback?token=${encodeURIComponent(token)}`;
        })
        .catch((err) => {
          setDesktopError(
            err instanceof Error
              ? err.message
              : t(($) => $.web.desktop_handoff.prepare_failed),
          );
        });
      return;
    }
    // Fresh form login (issue #5009): `user` was written by verifyCode while
    // handleVerify was still fetching the workspace list, so this effect used
    // to read the not-yet-seeded list cache and race handleSuccess with a
    // replace to /workspaces/new. handleSuccess owns post-login navigation;
    // this effect only serves visitors who arrived already authenticated.
    if (settledLoggedOutRef.current) return;
    if (nextUrl) {
      router.replace(nextUrl);
      return;
    }
    // Fetch instead of reading the cache: on a fresh page load the cache is
    // cold, and `getQueryData() ?? []` would misroute a user who does have
    // workspaces to /workspaces/new. On fetch failure fall back to [] —
    // same destination the cold-cache read produced, rather than trapping
    // the user on the login page.
    void qc
      .ensureQueryData(workspaceListOptions())
      .catch(() => [] as Workspace[])
      .then((list) => resolveLoggedInDestination(qc, hasOnboarded, list))
      .then((dest) => router.replace(dest));
  }, [
    isLoading,
    user,
    router,
    nextUrl,
    cliCallbackRaw,
    isDesktopHandoff,
    hasOnboarded,
    qc,
    t,
  ]);

  const handleSuccess = async () => {
    // Read the latest user snapshot directly — the closure's `hasOnboarded`
    // was captured before login completed and would be stale here.
    const currentUser = useAuthStore.getState().user;
    const onboarded = currentUser?.onboarded_at != null;
    if (nextUrl) {
      router.push(nextUrl);
      return;
    }
    const list = qc.getQueryData<Workspace[]>(workspaceKeys.list()) ?? [];
    router.push(await resolveLoggedInDestination(qc, onboarded, list));
  };

  // Build Google OAuth state: encode platform, next URL, and CLI callback
  // params so the callback can redirect to the right place after login.
  // CLI callback/state must survive the Google OAuth round-trip so the
  // post-login callback page can redirect the JWT back to the CLI's local
  // HTTP listener (critical for headless / WSL2 environments).
  const googleState = [
    platform === "desktop" ? "platform:desktop" : "",
    nextUrl ? `next:${nextUrl}` : "",
    cliCallbackRaw && validateCliCallback(cliCallbackRaw)
      ? `cli_callback:${encodeURIComponent(cliCallbackRaw)}`
      : "",
    cliState ? `cli_state:${encodeURIComponent(cliState)}` : "",
  ]
    .filter(Boolean)
    .join(",") || undefined;

  // While the desktop handoff is in progress (or has produced a token/error),
  // render a dedicated screen instead of flashing the login form or redirecting
  // away to a workspace page.
  if (isDesktopHandoff && user) {
    if (desktopError) {
      return (
        <div className="flex min-h-0 items-center justify-center">
          <Card className={BRAND_AUTH_CARD_CLASS_NAME}>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4">
                <BrandCardLogo />
              </div>
              <CardTitle className="text-2xl">
                {t(($) => $.web.desktop_handoff.failed_title)}
              </CardTitle>
              <CardDescription>{desktopError}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      );
    }
    return (
      <div className="flex min-h-0 items-center justify-center">
        <Card className={BRAND_AUTH_CARD_CLASS_NAME}>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4">
              <BrandCardLogo />
            </div>
            <CardTitle className="text-2xl">
              {t(($) => $.web.desktop_handoff.opening_title)}
            </CardTitle>
            <CardDescription>
              {desktopToken
                ? t(($) => $.web.desktop_handoff.opening_description)
                : t(($) => $.web.desktop_handoff.preparing)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            {desktopToken ? (
              <Button
                variant="outline"
                onClick={() => {
                  window.location.href = `iteamify://auth/callback?token=${encodeURIComponent(desktopToken)}`;
                }}
              >
                {t(($) => $.web.desktop_handoff.open_button)}
              </Button>
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Resolve the invitation before mounting the form so async data cannot
  // overwrite an email the user has already edited or flash password login.
  if (invitationId && !user && (isLoading || invitationLogin.isPending)) {
    return (
      <div className="flex min-h-0 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <LoginPage
      key={invitationId ?? "login"}
      passwordEnabled={passwordEnabled}
      allowSignup={allowSignup}
      initialMode={invitationId ? "code" : undefined}
      initialEmail={invitationLogin.data?.email ?? ""}
      logo={<BrandCardLogo />}
      onSuccess={handleSuccess}
      google={
        googleClientId
          ? {
              clientId: googleClientId,
              redirectUri: `${window.location.origin}/auth/callback`,
              state: googleState,
            }
          : undefined
      }
      cliCallback={
        cliCallbackRaw && validateCliCallback(cliCallbackRaw)
          ? { url: cliCallbackRaw, state: cliState }
          : undefined
      }
      onTokenObtained={setLoggedInCookie}
      containerClassName="min-h-0 items-stretch justify-stretch"
      cardClassName={BRAND_AUTH_CARD_CLASS_NAME}
    />
  );
}

export default function Page() {
  return (
    <BrandLoginShell>
      <Suspense
        fallback={
          <div
            className={`${BRAND_AUTH_CARD_CLASS_NAME} h-[430px] animate-pulse bg-white/70`}
            aria-hidden
          />
        }
      >
        <LoginPageContent />
      </Suspense>
    </BrandLoginShell>
  );
}
