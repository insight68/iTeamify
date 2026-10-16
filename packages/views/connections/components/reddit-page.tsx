"use client";
import { MessageSquare } from "lucide-react";
import { CollectionPageHeader } from "../../layout/collection-page";
import { useT } from "../../i18n";
import { RedditConnections } from "./channels/reddit-connections";
export function RedditPage() {
  const { t } = useT("connections");
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CollectionPageHeader
        icon={MessageSquare}
        title="Reddit"
        description={t(($) => $.reddit.description)}
      />
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-6xl p-4 sm:p-6 md:p-8">
          <RedditConnections />
        </div>
      </main>
    </div>
  );
}
