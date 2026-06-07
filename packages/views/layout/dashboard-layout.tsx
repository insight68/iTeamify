"use client";

import { lazy, Suspense, type ReactNode } from "react";
import { SidebarProvider, SidebarInset } from "@teamify/ui/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { DashboardGuard } from "./dashboard-guard";
import { WorkspacePresencePrefetch } from "./workspace-presence-prefetch";

const ModalRegistry = lazy(() => import("../modals/registry").then((m) => ({ default: m.ModalRegistry })));

interface DashboardLayoutProps {
  children: ReactNode;
  /** Rendered inside SidebarInset (e.g. SearchCommand, StarterContentPrompt — absolute-positioned overlays) */
  extra?: ReactNode;
  /** Loading indicator */
  loadingIndicator?: ReactNode;
}

export function DashboardLayout({
  children,
  extra,
  loadingIndicator,
}: DashboardLayoutProps) {
  return (
    <DashboardGuard
      loadingFallback={
        <div className="flex h-svh items-center justify-center">
          {loadingIndicator}
        </div>
      }
    >
      <SidebarProvider className="h-svh">
        <WorkspacePresencePrefetch />
        <AppSidebar />
        <SidebarInset className="relative overflow-hidden">
          {children}
          <Suspense fallback={null}>
            <ModalRegistry />
          </Suspense>
          {extra}
        </SidebarInset>
      </SidebarProvider>
    </DashboardGuard>
  );
}
