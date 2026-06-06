"use client";

import { useState, useCallback } from "react";
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
import { useAuthStore } from "@teamify/core/auth";
import { workspaceKeys } from "@teamify/core/workspace/queries";
import { api } from "@teamify/core/api";
import { useT } from "../i18n";

interface SetPasswordPageProps {
  logo?: React.ReactNode;
  onSuccess?: () => void;
  /** Called when user wants to go back to the previous page. */
  onBack?: () => void;
}

export function SetPasswordPage({ logo, onSuccess, onBack }: SetPasswordPageProps) {
  const { t } = useT("auth");
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      if (password.length < 8) {
        setError(t(($) => $.set_password.errors.password_too_short));
        return;
      }

      if (password !== confirmPassword) {
        setError(t(($) => $.set_password.errors.password_mismatch));
        return;
      }

      setLoading(true);
      try {
        await useAuthStore.getState().setPassword(password);
        setDone(true);
        // Navigate to workspace list or success destination
        if (onSuccess) {
          const wsList = await api.listWorkspaces();
          qc.setQueryData(workspaceKeys.list(), wsList);
          onSuccess();
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t(($) => $.set_password.errors.set_failed),
        );
      } finally {
        setLoading(false);
      }
    },
    [password, confirmPassword, t, onSuccess, qc],
  );

  if (done) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            {logo && <div className="mx-auto mb-4">{logo}</div>}
            <CardTitle className="text-2xl">
              {t(($) => $.set_password.done_title)}
            </CardTitle>
            <CardDescription>
              {t(($) => $.set_password.done_description)}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              onClick={onSuccess}
              className="w-full"
              size="lg"
            >
              {t(($) => $.set_password.continue)}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          {logo && <div className="mx-auto mb-4">{logo}</div>}
          <CardTitle className="text-2xl">
            {t(($) => $.set_password.title)}
          </CardTitle>
          <CardDescription>
            {t(($) => $.set_password.description)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="set-password-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{t(($) => $.common.password)}</Label>
              <Input
                id="password"
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
              <Label htmlFor="confirm-password">{t(($) => $.set_password.confirm_password)}</Label>
              <Input
                id="confirm-password"
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
            form="set-password-form"
            className="w-full"
            size="lg"
            disabled={!password || !confirmPassword || loading}
          >
            {loading ? t(($) => $.set_password.saving) : t(($) => $.set_password.submit)}
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
