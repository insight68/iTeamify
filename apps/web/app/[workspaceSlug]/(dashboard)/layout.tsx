"use client";

import { DashboardLayout } from "@iteamify/views/layout/dashboard-layout";
import { ITeamifyIcon } from "@iteamify/ui/components/common/iteamify-icon";
import { SearchCommand, SearchTrigger } from "@iteamify/views/search";
import { WebNotificationBridge } from "@/components/web-notification-bridge";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout
      loadingIndicator={<ITeamifyIcon className="size-6" />}
      searchSlot={<SearchTrigger />}
      extra={
        <>
          <SearchCommand />
          <WebNotificationBridge />
        </>
      }
    >
      {children}
    </DashboardLayout>
  );
}
