"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, parseWithFallback } from "@teamify/core/api";
import { InvitationPreviewSchema, EMPTY_INVITATION_PREVIEW } from "@teamify/core/api/schema";
import { useAuthStore } from "@teamify/core/auth";
import type { InvitationPreview } from "@teamify/core/types";
import {
  workspaceKeys,
  workspaceListOptions,
} from "@teamify/core/workspace/queries";
import { useT } from "../i18n";
import { InviteShell } from "./invite-shell";
import { Button } from "@teamify/ui/components/ui/button";
import { Card, CardContent } from "@teamify/ui/components/ui/card";
import { Input } from "@teamify/ui/components/ui/input";
import { Label } from "@teamify/ui/components/ui/label";
import { Skeleton } from "@teamify/ui/components/ui/skeleton";
import { Users, Check, X } from "lucide-react";

export interface InviteSignupPageProps {
  invitationId: string;
  onSuccess: (workspaceSlug?: string) => void;
  onLoginInstead: () => void;
}

export function InviteSignupPage({
  invitationId,
  onSuccess,
  onLoginInstead,
}: InviteSignupPageProps) {
  const { t } = useT("invite");
  const qc = useQueryClient();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const { data: preview, isLoading, error: fetchError } = useQuery({
    queryKey: ["invitation-preview", invitationId],
    queryFn: async () => {
      const raw = await api.getInvitationPreview(invitationId);
      return parseWithFallback(
        raw,
        InvitationPreviewSchema,
        EMPTY_INVITATION_PREVIEW,
        { endpoint: "GET /api/invitations/:id/preview" },
      ) as InvitationPreview;
    },
  });

  // If user_exists is true, redirect to login flow.
  const isExpired =
    preview?.status && preview.status !== "pending";
  const isAlreadyHandled =
    preview?.status === "accepted" || preview?.status === "declined";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t(($) => $.signup.error_password_too_short));
      return;
    }
    if (password !== confirmPassword) {
      setError(t(($) => $.signup.error_password_mismatch));
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.signupAndAcceptInvitation(invitationId, password);

      // Store the JWT in the auth store.
      const authStore = useAuthStore.getState();
      await authStore.loginWithToken(res.token);

      setDone(true);

      // Fetch the refreshed workspace list so we know the joined workspace's slug.
      const wsList = await qc.fetchQuery({
        ...workspaceListOptions(),
        staleTime: 0,
      });
      const joined = wsList.find((w) => w.id === preview?.workspace_id);
      qc.invalidateQueries({ queryKey: workspaceKeys.myInvitations() });

      setTimeout(() => onSuccess(joined?.slug), 1000);
    } catch (e) {
      if (e instanceof Error && e.message.includes("already exists")) {
        setError(t(($) => $.signup.error_user_exists));
      } else {
        setError(
          e instanceof Error
            ? e.message
            : t(($) => $.signup.error_signup_failed),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  // --- Render states ---

  if (isLoading) {
    return (
      <InviteShell showLogout={false}>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Skeleton className="h-12 w-12 rounded-full" />
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-9 w-32 rounded-md" />
          </CardContent>
        </Card>
      </InviteShell>
    );
  }

  if (fetchError || !preview) {
    return (
      <InviteShell showLogout={false}>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <X className="h-6 w-6 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">
              {t(($) => $.not_found.title)}
            </h2>
            <p className="text-sm text-muted-foreground text-center">
              {t(($) => $.not_found.description)}
            </p>
          </CardContent>
        </Card>
      </InviteShell>
    );
  }

  // If user already exists, show login prompt.
  if (preview.user_exists) {
    return (
      <InviteShell showLogout={false}>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-7 w-7 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold">
                {t(($) => $.main.join_title, {
                  workspace_name:
                    preview.workspace_name ??
                    t(($) => $.main.fallback_workspace_name),
                })}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(($) => $.signup.error_user_exists)}
              </p>
            </div>
            <Button className="w-full" onClick={onLoginInstead}>
              {t(($) => $.signup.login_instead)}
            </Button>
          </CardContent>
        </Card>
      </InviteShell>
    );
  }

  // Success state.
  if (done) {
    return (
      <InviteShell showLogout={false}>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Check className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-semibold">
              {t(($) => $.signup.success_title)}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(($) => $.signup.success_subtitle, {
                workspace_name:
                  preview.workspace_name ??
                  t(($) => $.main.fallback_workspace_name),
              })}
            </p>
          </CardContent>
        </Card>
      </InviteShell>
    );
  }

  // Expired / already handled.
  if (isAlreadyHandled || isExpired) {
    return (
      <InviteShell showLogout={false}>
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-7 w-7 text-primary" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold">
                {t(($) => $.main.join_title, {
                  workspace_name:
                    preview.workspace_name ??
                    t(($) => $.main.fallback_workspace_name),
                })}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isAlreadyHandled
                  ? preview.status === "accepted"
                    ? t(($) => $.main.already_handled_accepted)
                    : t(($) => $.main.already_handled_declined)
                  : t(($) => $.main.expired)}
              </p>
            </div>
          </CardContent>
        </Card>
      </InviteShell>
    );
  }

  // Signup form.
  return (
    <InviteShell showLogout={false}>
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col gap-6 py-8">
          {/* Invitation details */}
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Users className="h-7 w-7 text-primary" />
            </div>
            <div className="text-center space-y-1">
              <h2 className="text-xl font-semibold">
                {t(($) => $.signup.subtitle, {
                  workspace_name:
                    preview.workspace_name ??
                    t(($) => $.main.fallback_workspace_name),
                })}
              </h2>
              <p className="text-sm text-muted-foreground">
                <strong>{preview.inviter_name || preview.inviter_email}</strong>{" "}
                {preview.role === "admin"
                  ? t(($) => $.main.invited_role_admin)
                  : t(($) => $.main.invited_role_member)}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="space-y-2">
              <Label>{t(($) => $.signup.email_label)}</Label>
              <Input
                type="email"
                value={preview.invitee_email}
                readOnly
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>{t(($) => $.signup.password_label)}</Label>
              <Input
                type="password"
                placeholder={t(($) => $.signup.password_placeholder)}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t(($) => $.signup.confirm_password_label)}</Label>
              <Input
                type="password"
                placeholder={t(($) => $.signup.password_placeholder)}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={
                submitting || !password || !confirmPassword
              }
            >
              {submitting
                ? t(($) => $.signup.submitting)
                : t(($) => $.signup.submit)}
            </Button>
          </form>

          <div className="text-center">
            <Button
              variant="link"
              className="text-sm text-muted-foreground"
              onClick={onLoginInstead}
            >
              {t(($) => $.signup.login_instead)}
            </Button>
          </div>
        </CardContent>
      </Card>
    </InviteShell>
  );
}
