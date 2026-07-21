import type { Metadata } from "next";
import { LandingPage } from "@teamify/views/marketing";

// Page-specific metadata. The root layout (apps/web/app/layout.tsx:75-104)
// already sets title template, OG defaults, and canonical "/" so this
// block just refines the page's own title/description and leaves the rest
// inherited. Logged-in users with a last-workspace cookie are redirected
// to /{slug}/issues by proxy.ts:79-83 before this page is ever rendered.
export const metadata: Metadata = {
  title: "iTeamify — AI经营团队协作平台",
  description:
    "iTeamify 连接订单、资金、库存、采购和销售数据，让对账、采购建议、库存调拨、销量预测和经营分析在同一个 AI 经营团队协作平台里自动流转。",
  alternates: { canonical: "/" },
  openGraph: {
    title: "iTeamify — AI经营团队协作平台",
    description:
      "对账、采购、库存调拨、销量预测和经营分析，由一组 AI 智能体和你的团队一起完成。",
    url: "/",
  },
  twitter: {
    title: "iTeamify — AI经营团队协作平台",
    description:
      "让 AI 智能体和你的团队一起跑经营闭环。",
  },
};

export default function RootPage() {
  return <LandingPage />;
}
