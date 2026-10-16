"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useAuthStore } from "@iteamify/core/auth";
import { WECHAT_QRCODE_SRC, WeChatIcon } from "./wechat";
import { WechatQrDialog } from "./wechat-qr-dialog";
import { useWechatCardDismissed } from "./use-wechat-card-dismissed";
import { useT } from "../i18n";

/**
 * Dismissible "Follow our WeChat official account" promo pinned to the
 * bottom of the left sidebar (above the help launcher). Shows a QR thumbnail
 * and opens a larger QR in a dialog on click. Once dismissed it stays hidden
 * for that user on this browser — see {@link useWechatCardDismissed}.
 */
export function WechatCard() {
  const { t } = useT("layout");
  const userId = useAuthStore((s) => s.user?.id);
  const [dismissed, dismiss] = useWechatCardDismissed(userId);
  const [qrOpen, setQrOpen] = useState(false);

  if (dismissed) return null;

  const title = t(($) => $.sidebar.wechat_card.title);
  const description = t(($) => $.sidebar.wechat_card.description);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setQrOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-md border border-sidebar-border bg-sidebar-accent/50 p-2.5 pr-7 text-left transition-colors hover:bg-sidebar-accent"
      >
        <img
          src={WECHAT_QRCODE_SRC}
          alt={title}
          className="size-11 shrink-0 rounded-sm bg-white object-contain p-0.5"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <WeChatIcon className="size-3.5 shrink-0 text-[#07C160]" />
            <span className="block text-xs font-medium text-sidebar-foreground">
              {title}
            </span>
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
            {description}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={t(($) => $.sidebar.wechat_card.dismiss)}
        onClick={dismiss}
        className="absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-sidebar-border hover:text-foreground"
      >
        <X className="size-3" />
      </button>
      <WechatQrDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        title={title}
        description={description}
      />
    </div>
  );
}
