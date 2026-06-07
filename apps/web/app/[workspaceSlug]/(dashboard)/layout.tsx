"use client";

import { lazy, Suspense } from "react";
import { DashboardLayout } from "@teamify/views/layout";
import { TeamifyIcon } from "@teamify/ui/components/common/teamify-icon";

const SearchCommand = lazy(() => import("@teamify/views/search").then((m) => ({ default: m.SearchCommand })));
const StarterContentPrompt = lazy(() => import("@teamify/views/onboarding").then((m) => ({ default: m.StarterContentPrompt })));

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout
      loadingIndicator={<TeamifyIcon className="size-6" />}
      extra={
        <Suspense fallback={null}>
          <SearchCommand />
          <StarterContentPrompt />
        </Suspense>
      }
    >
      {children}
    </DashboardLayout>
  );
}
