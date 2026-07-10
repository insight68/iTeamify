import type { Metadata } from "next";
import { CareersPage } from "@teamify/views/marketing";

export const metadata: Metadata = {
  title: "招聘企业 Agent FDE 工程师｜iTeamify",
  description:
    "均朴科技招聘企业 Agent FDE 工程师，参与企业级 Agent 前端界面、部署工具链、业务落地和工程化建设。",
  alternates: { canonical: "/careers" },
  openGraph: {
    title: "招聘企业 Agent FDE 工程师｜iTeamify",
    description:
      "加入均朴智能，参与企业 Agent 研发与部署平台，把 AI Native 产品能力带到真实企业场景。",
    url: "/careers",
  },
  twitter: {
    title: "招聘企业 Agent FDE 工程师｜iTeamify",
    description: "企业 Agent 前端部署工程师岗位开放，简历投递至 hr@junpu.org。",
  },
};

export default function CareersRoute() {
  return <CareersPage />;
}
