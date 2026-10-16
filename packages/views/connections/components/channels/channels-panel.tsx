"use client";

import { useQuery } from "@tanstack/react-query";
import { MessageCircleMore, MessagesSquare } from "lucide-react";
import { useAuthStore } from "@iteamify/core/auth";
import { useWorkspaceId } from "@iteamify/core/hooks";
import { larkInstallationsOptions } from "@iteamify/core/lark";
import { redditConnectionsOptions } from "@iteamify/core/reddit";
import { slackInstallationsOptions } from "@iteamify/core/slack";
import { memberListOptions } from "@iteamify/core/workspace/queries";
import { CollectionPageState } from "../../../layout/collection-page";
import { useT } from "../../../i18n";
import { ConnectionPanelHeader } from "../connection-panel-header";
import { LarkConnections } from "./lark-connections";
import { RedditConnections } from "./reddit-connections";
import { SlackConnections } from "./slack-connections";

export function ChannelsPanel({ embedded = false }: { embedded?: boolean }) {
  const { t } = useT("connections");
  const workspaceId = useWorkspaceId();
  const user = useAuthStore((state) => state.user);
  const membersQuery = useQuery(memberListOptions(workspaceId));
  const larkQuery = useQuery(larkInstallationsOptions(workspaceId));
  const slackQuery = useQuery(slackInstallationsOptions(workspaceId));
  const redditQuery = useQuery(redditConnectionsOptions(workspaceId));
  const currentMember = membersQuery.data?.find(
    (member) => member.user_id === user?.id,
  );
  const canManage =
    currentMember?.role === "owner" || currentMember?.role === "admin";
  const showLark =
    canManage ||
    larkQuery.data?.configured === true ||
    (larkQuery.data?.installations.length ?? 0) > 0;
  const showSlack =
    canManage ||
    slackQuery.data?.configured === true ||
    (slackQuery.data?.installations.length ?? 0) > 0;
  const showReddit =
    canManage ||
    redditQuery.data?.configured === true ||
    (redditQuery.data?.connections.length ?? 0) > 0;
  const isLoading =
    membersQuery.isLoading || larkQuery.isLoading || slackQuery.isLoading || redditQuery.isLoading;

  return (
    <div className={embedded ? "space-y-6" : "mx-auto w-full max-w-5xl space-y-10 p-4 sm:p-6 md:p-8"}>
      {!embedded ? (
        <ConnectionPanelHeader
          icon={MessagesSquare}
          title={t(($) => $.channels.title)}
          description={t(($) => $.channels.description)}
          scope={t(($) => $.scope.workspace)}
        />
      ) : null}

      {isLoading ? (
        <CollectionPageState
          role="status"
          icon={MessagesSquare}
          title={t(($) => $.loading)}
        />
      ) : (
        <>
          {showLark ? (
            <section id="feishu" className="scroll-mt-6 space-y-3">
              <ProviderHeading
                icon={MessageCircleMore}
                title={t(($) => $.channels.feishu_title)}
                description={t(($) => $.channels.feishu_description)}
              />
              <LarkConnections />
            </section>
          ) : null}

          {showSlack ? (
            <section id="slack" className="scroll-mt-6 space-y-3">
              <ProviderHeading
                icon={MessagesSquare}
                title="Slack"
                description={t(($) => $.channels.slack_description)}
              />
              <SlackConnections />
            </section>
          ) : null}

          {showReddit ? (
            <section id="reddit" className="scroll-mt-6 space-y-3">
              <ProviderHeading
                icon={MessageCircleMore}
                title="Reddit"
                description={t(($) => $.reddit.description)}
              />
              <RedditConnections />
            </section>
          ) : null}

          {!embedded && !showLark && !showSlack && !showReddit ? (
            <CollectionPageState
              icon={MessagesSquare}
              title={t(($) => $.channels.empty_title)}
              description={t(($) => $.channels.empty_description)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function ProviderHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof MessagesSquare;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-surface-border bg-surface-raised text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-pretty">{title}</h2>
        <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground text-pretty">
          {description}
        </p>
      </div>
    </div>
  );
}
