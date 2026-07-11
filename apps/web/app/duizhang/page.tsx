import type { Metadata } from "next";
import { ReconciliationLandingPage } from "@teamify/views/duizhang";

export const metadata: Metadata = {
  title: "iTeamify AI 对账工具",
  description:
    "面向电商团队的 AI 对账工具，自动完成订单匹配、费用核对、利润分析和异常监控。",
  alternates: { canonical: "/duizhang" },
  openGraph: {
    title: "iTeamify AI 对账工具",
    description: "月度对账，从 3 天到 30 分钟。",
    url: "/duizhang",
  },
};

export default function DuizhangPage() {
  return <ReconciliationLandingPage />;
}
