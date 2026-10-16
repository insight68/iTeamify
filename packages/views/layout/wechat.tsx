import { QrCode } from "lucide-react";

/** WeChat official account QR code, served from the web app's /public. */
export const WECHAT_QRCODE_SRC = "/agentlabs-qrcode.jpg";

// WeChat green is #07C160. lucide ships no WeChat brand glyph, so we use the
// QR-code mark — the QR is exactly what users scan to follow the account.
export function WeChatIcon({ className }: { className?: string }) {
  return <QrCode className={className} aria-hidden="true" />;
}
