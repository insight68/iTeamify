"use client";

import { DashboardLayout } from "@teamify/views/layout";
import { TeamifyIcon } from "@teamify/ui/components/common/teamify-icon";
import { SearchCommand, SearchTrigger } from "@teamify/views/search";
import { StarterContentPrompt } from "@teamify/views/onboarding";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout
      loadingIndicator={<TeamifyIcon className="size-6" />}
      extra={
        <>
          <SearchCommand />
          <StarterContentPrompt />
        </>
      }
    >
      {children}
    </DashboardLayout>
  );
}
