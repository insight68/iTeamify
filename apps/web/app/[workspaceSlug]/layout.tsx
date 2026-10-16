import { AppShell } from "@/components/app-shell";
import { WorkspaceLayoutClient } from "./workspace-layout-client";

export default function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceSlug: string }>;
}) {
  return (
    <AppShell>
      <WorkspaceLayoutClient params={params}>{children}</WorkspaceLayoutClient>
    </AppShell>
  );
}
