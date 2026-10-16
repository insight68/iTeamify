"use client";

import { useQuery } from "@tanstack/react-query";
import { Plug, Sparkles } from "lucide-react";
import { useFeatureEnabled, useConfigStore } from "@iteamify/core/config";
import { COMPOSIO_MCP_APPS_FLAG } from "@iteamify/core/feature-flags";
import { useWorkspaceId } from "@iteamify/core/hooks";
import { vcsConnectionsOptions } from "@iteamify/core/vcs";
import { CollectionPageHeader } from "../../layout/collection-page";
import { useT } from "../../i18n";
import { ComposioAppsPanel } from "./apps/composio-apps-panel";
import { ChannelsPanel } from "./channels/channels-panel";
import { GmailConnections } from "./gmail/gmail-connections";
import { SourceControlPanel } from "./source-control/source-control-panel";

export function ConnectionsPage() {
  const { t } = useT("connections");
  const workspaceId = useWorkspaceId();
  const composioCatalogEnabled = useFeatureEnabled(COMPOSIO_MCP_APPS_FLAG, false);
  const vcsAvailable = useConfigStore((state) => state.vcsIntegrationAvailable);
  const vcsQuery = useQuery(vcsConnectionsOptions(workspaceId));
  const showSourceControl =
    vcsAvailable || (vcsQuery.data?.connections.length ?? 0) > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CollectionPageHeader
        icon={Plug}
        title={t(($) => $.page.title)}
        description={t(($) => $.page.description)}
      />

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-6xl space-y-10 p-4 sm:p-6 md:p-8">
          <div className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-background to-background px-4 py-3.5 shadow-xs">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t(($) => $.unified.title)}</p>
              <p className="mt-0.5 max-w-3xl text-xs leading-5 text-muted-foreground text-pretty">
                {t(($) => $.unified.description)}
              </p>
            </div>
          </div>

          <GmailConnections />
          <ChannelsPanel embedded />
          {showSourceControl ? <SourceControlPanel embedded /> : null}
          <ComposioAppsPanel embedded showFullCatalog={composioCatalogEnabled} />
        </div>
      </main>
    </div>
  );
}
