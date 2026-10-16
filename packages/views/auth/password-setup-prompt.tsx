"use client";

import { useState } from "react";
import { useAuthStore, usePasswordStatus } from "@iteamify/core/auth";
import { useConfigStore } from "@iteamify/core/config";
import { Button } from "@iteamify/ui/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@iteamify/ui/components/ui/dialog";
import { PasswordSettings } from "./password-settings";
import { useT } from "../i18n";

export function PasswordSetupPrompt() {
  const { t } = useT("auth");
  const enabled = useConfigStore((state) => state.passwordAuthEnabled);
  const userId = useAuthStore((state) => state.user?.id ?? "");
  const status = usePasswordStatus();
  const [dismissedUser, setDismissedUser] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  if (!enabled || !userId || dismissedUser === userId || status.data?.has_password !== false) return null;
  return (
    <>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/50 px-4 py-3">
        <p className="min-w-0 text-sm text-muted-foreground">{t(($) => $.password.prompt_description)}</p>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>{t(($) => $.password.set)}</Button>
          <Button size="sm" variant="ghost" onClick={() => setDismissedUser(userId)}>{t(($) => $.password.skip)}</Button>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(($) => $.password.prompt_title)}</DialogTitle>
            <DialogDescription>{t(($) => $.password.prompt_description)}</DialogDescription>
          </DialogHeader>
          <PasswordSettings onSaved={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
