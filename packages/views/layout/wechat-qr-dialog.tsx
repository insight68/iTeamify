"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@iteamify/ui/components/ui/dialog";
import { WECHAT_QRCODE_SRC } from "./wechat";

/**
 * Dialog showing the WeChat official-account QR code. Controlled by the
 * caller — each entry point (sidebar card, help menu, landing footer) keeps
 * its own open state and renders this. `title`/`description` are passed in
 * so the dialog stays free of any i18n dependency and works in both the app
 * (views i18n) and the landing page (its own dictionary).
 */
export function WechatQrDialog({
  open,
  onOpenChange,
  title,
  description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-center">
        <img
          src={WECHAT_QRCODE_SRC}
          alt={title}
          className="mx-auto size-48 rounded-lg bg-white object-contain p-1"
        />
        <DialogHeader className="text-center">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
