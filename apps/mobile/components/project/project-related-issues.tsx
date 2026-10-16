/**
 * Issues belonging to a project — status-grouped list.
 *
 * Mobile intentionally does NOT implement web's Board (kanban) view, only
 * the List form. Reasons:
 *   - Phone screens are too narrow to show ≥3 status columns at once, so
 *     kanban loses its core "see all-statuses pipeline at a glance" value;
 *     users end up swiping between near-empty columns.
 *   - Major mobile task apps (Linear iOS, Things, Apple Reminders) don't
 *     ship kanban either — list with status grouping is the established
 *     small-screen pattern for the same data.
 *   - This is a UI divergence, NOT semantic divergence (per
 *     mobile/CLAUDE.md "Behavioral parity"): same issues, same status
 *     enum, same 6 BOARD_STATUSES grouping as web — only the layout
 *     differs. UI may diverge when semantics agree.
 *
 * Status grouping uses full `BOARD_STATUSES` (six visible groups, cancelled
 * excluded) to match web `packages/views/projects/components/project-detail.tsx`.
 * The earlier mobile-only "Open / Done" two-bucket layout was a parity
 * violation: same status enum value would appear in different visible
 * groups on mobile vs web. Cancelled is omitted on both clients.
 */
import { useMemo } from "react";
import { View } from "react-native";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import type { Issue, IssueStatus } from "@iteamify/core/types";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { StatusIcon } from "@/components/ui/status-icon";
import { IssueRow } from "@/components/issue/issue-row";
import { IssuesLoading } from "@/components/issue/issues-loading";
import { loadedIssues } from "@/data/queries/issues";
import { projectIssuesOptions } from "@/data/queries/projects";
import { useIssuesViewStore } from "@/data/stores/issues-view-store";
import { useWorkspaceStore } from "@/data/workspace-store";
import { BOARD_STATUSES, STATUS_LABEL } from "@/lib/issue-status";

interface Props {
  projectId: string;
}

export function ProjectRelatedIssues({ projectId }: Props) {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsSlug = useWorkspaceStore((s) => s.currentWorkspaceSlug);
  const { data, isLoading, error, refetch } = useInfiniteQuery(
    projectIssuesOptions(wsId, projectId),
  );

  // Bounded preview inside the project's ScrollView. The full list is virtualized.
  const preview = useMemo(() => loadedIssues(data).slice(0, 20), [data]);
  const total = data?.pages[0]?.total ?? 0;
  const byStatus = useMemo(() => {
    const m = new Map<IssueStatus, Issue[]>();
    for (const status of BOARD_STATUSES) m.set(status, []);
    for (const issue of preview) {
      const list = m.get(issue.status);
      if (list) list.push(issue);
    }
    return m;
  }, [preview]);

  const navigateToIssue = (id: string) => {
    if (wsSlug) router.push(`/${wsSlug}/issue/${id}`);
  };

  if (isLoading) return <IssuesLoading />;

  if (error) {
    return (
      <View className="px-4 py-6 gap-3">
        <Text className="text-sm text-destructive">
          Failed to load issues:{" "}
          {error instanceof Error ? error.message : "unknown error"}
        </Text>
        <Button variant="outline" onPress={() => refetch()}>
          <Text>Retry</Text>
        </Button>
      </View>
    );
  }

  if (preview.length === 0) {
    return (
      <View className="px-4 py-6">
        <Text className="text-sm text-muted-foreground">No issues yet.</Text>
      </View>
    );
  }

  return (
    <View>
      <Text className="px-4 py-2 text-xs text-muted-foreground">{preview.length} of {total} issues</Text>
      {BOARD_STATUSES.map((status) => {
        const issues = byStatus.get(status) ?? [];
        if (issues.length === 0) return null;
        return (
          <View key={status}>
            <SectionHeader status={status} count={total > preview.length ? undefined : issues.length} />
            {issues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                onPress={() => navigateToIssue(issue.id)}
              />
            ))}
          </View>
        );
      })}
      {total > preview.length ? <View className="p-4"><Button variant="outline" onPress={() => {
        useIssuesViewStore.getState().clearFilters();
        useIssuesViewStore.getState().setScope("all");
        if (wsSlug) router.push({ pathname: "/[workspace]/more/issues", params: { workspace: wsSlug, projectId } });
      }}><Text>View all issues</Text></Button></View> : null}
    </View>
  );
}

function SectionHeader({
  status,
  count,
}: {
  status: IssueStatus;
  count?: number;
}) {
  return (
    <View className="flex-row items-center gap-2 px-4 py-2 bg-background">
      <StatusIcon status={status} size={14} />
      <Text className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
        {STATUS_LABEL[status]}
      </Text>
      {count !== undefined ? <Text className="text-xs text-muted-foreground/60">{count}</Text> : null}
    </View>
  );
}
